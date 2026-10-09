// Package orders holds the domain: orders, their items and the service that
// places them.
package orders

import "time"

// Status is where an order is in its life.
type Status string

const (
	StatusPlaced  Status = "placed"
	StatusShipped Status = "shipped"
)

// Item is one line of an order.
type Item struct {
	SKU      string
	Quantity int
}

// Order is a customer's request for items.
type Order struct {
	ID       string
	Items    []Item
	Status   Status
	PlacedAt time.Time
}

// Repository stores orders.
type Repository interface {
	Save(o Order) error
	Get(id string) (Order, error)
}

// Clock tells the time; tests replace it.
type Clock interface {
	Now() time.Time
}

// SystemClock is the real clock.
type SystemClock struct{}

// Now returns the current time.
func (SystemClock) Now() time.Time { return time.Now() }
