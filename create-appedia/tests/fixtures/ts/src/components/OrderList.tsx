import type { Order } from "@/types";

interface Props {
  orders: Order[];
  onSelect?: (id: string) => void;
}

/** Shows every order with its status. */
export function OrderList({ orders, onSelect }: Props) {
  return (
    <ul>
      {orders.map(o => (
        <li key={o.id} onClick={() => onSelect?.(o.id)}>{o.id}: {o.status}</li>
      ))}
    </ul>
  );
}
