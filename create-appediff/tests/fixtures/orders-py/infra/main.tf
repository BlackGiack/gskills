# Infrastructure of the orders service (fictional fixture for the Terraform extractor).

variable "project" {
  type = string
}

variable "image" {
  description = "Container image of the orders API"
  type        = string
}

locals {
  region = "europe-west1"
}

resource "google_service_account" "orders_api" {
  account_id = "orders-api"
}

resource "google_project_iam_member" "api_logs" {
  project = var.project
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.orders_api.email}"
}

# The HTTP API (cmd/orders)
resource "google_cloud_run_v2_service" "orders_api" {
  name     = "orders-api"
  location = local.region
  template {
    service_account = google_service_account.orders_api.email
    containers {
      image = var.image
    }
  }
}

resource "google_pubsub_topic" "orders_placed" {
  name = "orders-placed"
}

resource "google_pubsub_topic" "export_requested" {
  name = "export-requested"
}

resource "google_pubsub_topic_iam_member" "api_publisher" {
  topic  = google_pubsub_topic.orders_placed.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${google_service_account.orders_api.email}"
}

# Every placed order is pushed back to the API's /events endpoint
resource "google_pubsub_subscription" "orders_to_api" {
  name  = "orders-to-api"
  topic = google_pubsub_topic.orders_placed.id
  push_config {
    push_endpoint = "${google_cloud_run_v2_service.orders_api.uri}/events"
    oidc_token {
      service_account_email = google_service_account.orders_api.email
    }
  }
}

resource "google_storage_bucket" "exports" {
  name     = "${var.project}-order-exports"
  location = local.region
}

resource "google_storage_notification" "exports_ready" {
  bucket         = google_storage_bucket.exports.name
  payload_format = "JSON_API_V1"
  topic          = google_pubsub_topic.export_requested.id
  depends_on     = [google_pubsub_topic_iam_member.api_publisher]
}

resource "google_cloudfunctions2_function" "export_worker" {
  name     = "export-worker"
  location = local.region
  event_trigger {
    event_type   = "google.cloud.pubsub.topic.v1.messagePublished"
    pubsub_topic = google_pubsub_topic.export_requested.id
  }
  service_config {
    service_account_email = google_service_account.orders_api.email
  }
}

resource "google_cloud_scheduler_job" "nightly_export" {
  name     = "nightly-export"
  schedule = "0 2 * * *"
  pubsub_target {
    topic_name = google_pubsub_topic.export_requested.id
    data       = base64encode("export")
  }
}

resource "google_bigquery_dataset" "audit" {
  dataset_id = "orders_audit"
}

resource "google_logging_project_sink" "audit" {
  name        = "orders-audit"
  destination = "bigquery.googleapis.com/projects/${var.project}/datasets/${google_bigquery_dataset.audit.dataset_id}"
  filter      = "resource.type=\"cloud_run_revision\""
}

output "api_url" {
  value = google_cloud_run_v2_service.orders_api.uri
}
