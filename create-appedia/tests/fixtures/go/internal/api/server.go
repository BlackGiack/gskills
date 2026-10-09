// Package api exposes the orders service over HTTP.
package api

import (
	"encoding/json"
	"net/http"

	"example.com/orders/internal/orders"
)

// Server routes HTTP requests to the orders service.
type Server struct {
	svc *orders.Service
	mux *http.ServeMux
}

// NewServer wires the routes.
func NewServer(svc *orders.Service) *Server {
	s := &Server{svc: svc, mux: http.NewServeMux()}
	s.mux.HandleFunc("POST /orders", s.handleCreate)
	s.mux.HandleFunc("GET /orders/{id}", s.handleGet)
	return s
}

// ServeHTTP implements http.Handler.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.mux.ServeHTTP(w, r) }

// handleCreate decodes an order and places it.
func (s *Server) handleCreate(w http.ResponseWriter, r *http.Request) {
	var o orders.Order
	if err := json.NewDecoder(r.Body).Decode(&o); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	placed, err := s.svc.Place(o)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	_ = json.NewEncoder(w).Encode(placed)
}

// handleGet returns one order.
func (s *Server) handleGet(w http.ResponseWriter, r *http.Request) {
	o, err := s.svc.Get(r.PathValue("id"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	_ = json.NewEncoder(w).Encode(o)
}
