// Package store keeps orders in memory.
package store

import (
	"fmt"
	"sync"

	"example.com/orders/internal/orders"
)

// Memory is an in-memory orders.Repository.
type Memory struct {
	mu     sync.Mutex
	orders map[string]orders.Order
}

// NewMemory returns an empty store.
func NewMemory() *Memory { return &Memory{orders: map[string]orders.Order{}} }

// Save stores or replaces an order.
func (m *Memory) Save(o orders.Order) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.orders[o.ID] = o
	return nil
}

// Get returns an order by ID.
func (m *Memory) Get(id string) (orders.Order, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	o, ok := m.orders[id]
	if !ok {
		return orders.Order{}, fmt.Errorf("order %s not found", id)
	}
	return o, nil
}
