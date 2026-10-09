import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { Order, Item } from "@/types";

/** Loads the orders and places new ones. */
export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  useEffect(() => {
    api.list().then(setOrders);
  }, []);
  const place = async (items: Item[]) => {
    const placed = await api.place(items);
    setOrders(prev => [...prev, placed]);
  };
  return { orders, place };
}
