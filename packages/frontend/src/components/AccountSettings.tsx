import { useState } from "react";
import { apiErrorText, type Language, t } from "../i18n.js";
import { useAccount } from "./AuthGate.js";
import { ProblemReportSheet } from "./ProblemReportSheet.js";
import { ListButton, ListGroup, ListRow } from "./ui/List.js";
import { Notice } from "./ui/Notice.js";

export function AccountSettings({ id, lang }: { id: string; lang: Language }) {
  const { account, signOut } = useAccount();
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  return (
    <div id={id}>
      <ListGroup title={t(lang, "accountTitle")}>
        <ListRow label={t(lang, "signedInAs")} value={account.name} />
        <ListButton
          label={t(lang, "signOut")}
          value=""
          onClick={() =>
            void signOut().catch((err: unknown) =>
              setError(apiErrorText(lang, err)),
            )
          }
        />
        <ListButton
          label={t(lang, "reportProblem")}
          value=""
          onClick={() => setReporting(true)}
        />
      </ListGroup>
      {error && <Notice tone="danger">{error}</Notice>}
      <ProblemReportSheet
        open={reporting}
        lang={lang}
        onClose={() => setReporting(false)}
      />
    </div>
  );
}
