{
  lib,
  stdenv,
  nodejs_22,
  pnpm,
  fetchPnpmDeps,
  pnpmConfigHook,
  makeWrapper,
}:

stdenv.mkDerivation (finalAttrs: {
  pname = "tashi";
  version = "0.0.1";

  src = lib.fileset.toSource {
    root = ./..;
    fileset =
      lib.fileset.difference
        (lib.fileset.unions [
          ../package.json
          ../pnpm-lock.yaml
          ../pnpm-workspace.yaml
          ../tsconfig.base.json
          ../data/foods.db
          ../packages
        ])
        (
          lib.fileset.unions (
            map lib.fileset.maybeMissing [
              # A local build would otherwise copy in development data and build output.
              ../packages/backend/data
              ../packages/backend/public
              ../packages/backend/node_modules
              ../packages/backend/dist
              ../packages/backend/catalog
              ../packages/frontend/node_modules
              ../packages/frontend/dist
              ../packages/shared/node_modules
              ../packages/shared/dist
              ../packages/e2e
              ../packages/design-system/node_modules
            ]
          )
        );
  };

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    fetcherVersion = 2;
    hash = "sha256-XZdS8PkYJSP6zZSmbyZtGYskF3a6cGympbtZsC9c2V8=";
  };

  nativeBuildInputs = [
    nodejs_22
    pnpm
    pnpmConfigHook
    makeWrapper
  ];

  buildPhase = ''
    runHook preBuild
    pnpm --filter @tashi/shared --filter @tashi/backend --filter @tashi/frontend build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    app=$out/lib/tashi
    pnpm --offline --config.inject-workspace-packages=true --filter @tashi/backend deploy --prod $app
    rm -r $app/src $app/scripts $app/dist/__tests__
    cp -r packages/frontend/dist $app/public
    rm -rf $app/catalog
    cp -r packages/backend/catalog $app/catalog

    # The server finds its static files at ./public.
    makeWrapper ${lib.getExe nodejs_22} $out/bin/tashi \
      --chdir $app \
      --add-flags --disable-warning=ExperimentalWarning \
      --add-flags $app/dist/server.js

    runHook postInstall
  '';

  meta = {
    description = "Insulin dose calculator for type 1 diabetes";
    mainProgram = "tashi";
    platforms = lib.platforms.unix;
  };
})
