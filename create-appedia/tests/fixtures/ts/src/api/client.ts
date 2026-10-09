import type { Order, Item } from "@/types";

/** Talks to the orders API. */
export class ApiClient {
  constructor(private baseUrl: string) {}

  /** POST /orders */
  async place(items: Item[]): Promise<Order> {
    const res = await fetch(`${this.baseUrl}/orders`, { method: "POST", body: JSON.stringify({ items }) });
    return res.json();
  }

  /** GET /orders */
  async list(): Promise<Order[]> {
    const res = await fetch(`${this.baseUrl}/orders`);
    return res.json();
  }
}

export const api = new ApiClient("/api");
