// Command orders serves the orders API.
package main

import (
	"log"
	"net/http"

	"example.com/orders/internal/api"
	"example.com/orders/internal/orders"
	"example.com/orders/internal/store"
)

func main() {
	svc := orders.NewService(store.NewMemory(), orders.SystemClock{})
	srv := api.NewServer(svc)
	log.Fatal(http.ListenAndServe(":8080", srv))
}
