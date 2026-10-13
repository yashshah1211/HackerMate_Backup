import { useState } from "react";
import { createRoot } from "react-dom/client";
import { NotificationProvider } from "../../../src/context/NotificationContext";
import { DevelopersView } from "../../../src/app/developers/DevelopersView";
import { useDevelopersData } from "../../../src/app/developers/useDevelopersData";

function Directory() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"fit" | "active" | "new">("fit");
  const data = useDevelopersData(search, sort);
  return <DevelopersView {...data} onRetry={data.retry} search={search} onSearch={setSearch} sort={sort} onSort={setSort} onSendInvite={data.sendInvite} />;
}
// Isolated component harness, not the authenticated Next.js /developers route.
createRoot(document.getElementById("root")!).render(<NotificationProvider><Directory /></NotificationProvider>);
