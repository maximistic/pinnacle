"use client";

import { useState } from "react";
import HoldingsTable, { type Holding } from "@/components/HoldingsTable";
import TransactionDrawer from "@/components/TransactionDrawer";

export default function MutualFundsPage() {
  const [selected, setSelected] = useState<Holding | null>(null);

  return (
    <>
      <HoldingsTable
        title="Mutual Funds"
        addLabel="Mutual Fund"
        apiType="MUTUAL_FUND"
        fixedType="MUTUAL_FUND"
        quantityLabel="Units"
        extraCols={{ avgLabel: "Avg NAV", currentLabel: "Current NAV" }}
        showIsin
        showFolioNumber
        showAmfi={true}
        showPriceRefresh={true}
        onRowClick={setSelected}
        emptyMessage="No mutual funds yet. Upload your CAS or add manually."
      />
      <TransactionDrawer holding={selected} onClose={() => setSelected(null)} />
    </>
  );
}
