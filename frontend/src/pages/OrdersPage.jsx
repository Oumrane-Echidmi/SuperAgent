import { useState } from "react";
import { Link } from "react-router-dom";
import { Columns3, Plus } from "lucide-react";
import Page from "../components/Page";
import ResourceState from "../components/ResourceState";
import { useResource, useWorkspace } from "../context/WorkspaceContext";
import { mad } from "../lib/api";

export default function OrdersPage() {
  const { tenant } = useWorkspace(),
    [page, setPage] = useState(1),
    orders = useResource(
      `/tenants/${tenant.id}/order-attempts?page=${page}&pageSize=25`,
    ),
    items = orders.data?.data ?? [],
    pagination = orders.data?.pagination;
  return (
    <Page
      icon={Columns3}
      title="Order board"
      count={pagination?.totalItems}
      actions={
        <Link className="live-primary" to="/orders/new">
          <Plus size={15} />
          Record order
        </Link>
      }
    >
      <div className="live-workspace">
        <div className="live-section-head">
          <div>
            <h2>Every customer decision, recorded.</h2>
            <p className="live-muted">Manual orders for {tenant.name}.</p>
          </div>
          <button className="live-secondary" onClick={orders.reload}>
            Refresh orders
          </button>
        </div>
        <ResourceState resource={orders} />
        {orders.data && items.length === 0 ? (
          <div className="live-state">
            <h2>No orders yet.</h2>
            <p className="live-muted">
              Record your first order to start tracking confirmations.
            </p>
            <Link className="live-primary" to="/orders/new">
              Record your first order
            </Link>
          </div>
        ) : (
          <div className="live-order-columns">
            {[
              ["PENDING", "Pending"],
              ["CONFIRMED", "Confirmed"],
              ["DECLINED", "Declined"],
            ].map(([status, label]) => (
              <section className="live-order-column" key={status}>
                <h2>
                  <span
                    className={`live-dot live-dot--${status.toLowerCase()}`}
                  />
                  {label}
                  <span className="live-muted">
                    {items.filter((item) => item.status === status).length}
                  </span>
                </h2>
                {items
                  .filter((item) => item.status === status)
                  .map((item) => (
                    <Link
                      className="live-order-card"
                      to={`/orders/${item.id}`}
                      key={item.id}
                    >
                      <strong>
                        {item.details.recipient ?? "Customer details needed"}
                      </strong>
                      <p>
                        {item.details.item ?? "Item not added"}
                        {item.details.quantity
                          ? ` × ${item.details.quantity}`
                          : ""}
                      </p>
                      <div>
                        <span>{mad(item.review.amountMinor)}</span>
                        <span className="live-muted">
                          {new Date(item.startedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </Link>
                  ))}
              </section>
            ))}
          </div>
        )}
        {pagination && pagination.totalPages > 1 && (
          <div className="live-pagination">
            <button
              className="live-secondary"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {pagination.totalPages}
            </span>
            <button
              className="live-secondary"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </Page>
  );
}
