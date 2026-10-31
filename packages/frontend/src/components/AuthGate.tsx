import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import * as api from "../api.js";
import { savedLanguage } from "../i18n.js";
import { SignInView } from "./SignInView.js";

type AuthState =
  | { kind: "checking" }
  | { kind: "signed_out" }
  | { kind: "signed_in"; account: api.SignedInAccount };

interface AccountActions {
  account: api.SignedInAccount;
  signOut: () => Promise<void>;
}

const AccountContext = createContext<AccountActions | null>(null);

export function useAccount(): AccountActions {
  const actions = useContext(AccountContext);
  if (!actions) throw new Error("useAccount outside AuthGate");
  return actions;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ kind: "checking" });

  const check = useCallback(() => {
    api
      .getAccount()
      .then((account) => setState({ kind: "signed_in", account }))
      .catch(() => setState({ kind: "signed_out" }));
  }, []);

  useEffect(() => {
    check();
    const signedOut = () => setState({ kind: "signed_out" });
    window.addEventListener(api.SIGNED_OUT_EVENT, signedOut);
    return () => window.removeEventListener(api.SIGNED_OUT_EVENT, signedOut);
  }, [check]);

  if (state.kind === "checking") return null;
  if (state.kind === "signed_out") {
    return <SignInView lang={savedLanguage()} onSignedIn={check} />;
  }
  return (
    <AccountContext.Provider
      value={{
        account: state.account,
        signOut: async () => {
          await api.signOut();
          setState({ kind: "signed_out" });
        },
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}
