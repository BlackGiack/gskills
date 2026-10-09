import { OrderForm } from "@/components/OrderForm";
import { OrderList } from "@/components/OrderList";
import { useOrders } from "@/hooks/useOrders";

/** The whole page: a form and the list of orders. */
export default function App() {
  const { orders, place } = useOrders();
  return (
    <main>
      <OrderForm onSubmit={place} />
      <OrderList orders={orders} />
    </main>
  );
}
