/** Where an order is in its life. */
export enum Status {
  Placed = "placed",
  Shipped = "shipped",
}

/** One line of an order. */
export interface Item {
  sku: string;
  quantity: number;
}

/** A customer's request for items. */
export interface Order {
  id: string;
  items: Item[];
  status: Status;
}
