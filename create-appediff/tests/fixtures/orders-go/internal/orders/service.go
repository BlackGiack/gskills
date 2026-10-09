package orders

import (
	"errors"
	"fmt"
)

// ErrEmptyOrder is returned when an order has no items.
var ErrEmptyOrder = errors.New("order has no items")

// Service places and reads orders.
type Service struct {
	repo  Repository
	clock Clock
	seq   int
}

// NewService builds a Service.
func NewService(repo Repository, clock Clock) *Service {
	return &Service{repo: repo, clock: clock}
}

// Place validates an order, stamps it and saves it.
func (s *Service) Place(o Order) (Order, error) {
	if len(o.Items) == 0 {
		return Order{}, ErrEmptyOrder
	}
	s.seq++
	o.ID = fmt.Sprintf("o-%d", s.seq)
	o.Status = StatusPlaced
	o.PlacedAt = s.clock.Now()
	if err := s.repo.Save(o); err != nil {
		return Order{}, fmt.Errorf("save order: %w", err)
	}
	return o, nil
}

// Get reads one order.
func (s *Service) Get(id string) (Order, error) {
	return s.repo.Get(id)
}
