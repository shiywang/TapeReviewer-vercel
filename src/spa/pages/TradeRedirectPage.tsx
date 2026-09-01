import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { api } from "../lib/api";

export default function TradeRedirectPage() {
  const { id } = useParams();
  const [target, setTarget] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const tradeId = Number(id);
    if (!tradeId) {
      setFailed(true);
      return;
    }
    api
      .trade(tradeId)
      .then((t) => setTarget(`/day/${t.closed_at.slice(0, 10)}?trade=${t.id}`))
      .catch(() => setFailed(true));
  }, [id]);

  if (failed) return <Navigate to="/" replace />;
  if (!target) return <div className="p-8 text-sm text-muted">Opening trade…</div>;
  return <Navigate to={target} replace />;
}
