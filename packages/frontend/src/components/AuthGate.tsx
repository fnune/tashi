import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router";
import * as api from "../api.js";
import { apiErrorText, savedLanguage, t } from "../i18n.js";
import { SetupView } from "./SetupView.js";
import { SignInView } from "./SignInView.js";
import { TroubleScreen, WaitingForServer } from "./TroubleScreen.js";

type AuthState =
  | { kind: "checking" }
  | { kind: "unreachable"; reason: string }
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
  const location = useLocation();
  const navigate = useNavigate();

  const check = useCallback(() => {
    api
      .getAccount()
      .then((account) => setState({ kind: "signed_in", account }))
      .catch((error: unknown) =>
        setState(
          error instanceof api.ApiError && error.code === "signed_out"
            ? { kind: "signed_out" }
            : {
                kind: "unreachable",
                reason: apiErrorText(savedLanguage(), error),
              },
        ),
      );
  }, []);

  useEffect(() => {
    check();
    const signedOut = () => setState({ kind: "signed_out" });
    window.addEventListener(api.SIGNED_OUT_EVENT, signedOut);
    return () => window.removeEventListener(api.SIGNED_OUT_EVENT, signedOut);
  }, [check]);

  if (state.kind === "checking") {
    return <WaitingForServer lang={savedLanguage()} />;
  }
  if (state.kind === "unreachable") {
    const lang = savedLanguage();
    return (
      <TroubleScreen lang={lang} title={t(lang, "unreachableTitle")}>
        <p>{state.reason}</p>
      </TroubleScreen>
    );
  }
  if (state.kind === "signed_out" && location.pathname === "/setup") {
    return (
      <SetupView
        lang={savedLanguage()}
        onSetUp={() => {
          navigate("/", { replace: true });
          check();
        }}
      />
    );
  }
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
