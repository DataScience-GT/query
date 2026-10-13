"use client";

import React from "react";
import { body, sectionRule, sectionTitle } from "@/components/portal/ui";
import { SaleStation } from "./SaleStation";
import { StoreItems } from "./StoreItems";
import { StorePurchases } from "./StorePurchases";
import { StoreSettings } from "./StoreSettings";

/**
 * The points store for one edition: what hackers see, the table's sale
 * station and its history, and the catalog behind both.
 */
export function StoreTab({ hackathonId }: { hackathonId: string }) {
  return (
    <div className="space-y-10">
      <section>
        <h2 className={sectionTitle}>Store</h2>
        <p className={`mt-1 mb-6 max-w-2xl ${body}`}>
          Hackers spend the points they earned at events here. A sale takes
          points to spend; it never lowers what they earned or their place on
          the leaderboard.
        </p>
        <StoreSettings hackathonId={hackathonId} />
      </section>

      <div
        className={`grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12 ${sectionRule}`}
      >
        <SaleStation hackathonId={hackathonId} />
        <StorePurchases hackathonId={hackathonId} />
      </div>

      <div className={sectionRule}>
        <StoreItems hackathonId={hackathonId} />
      </div>
    </div>
  );
}
