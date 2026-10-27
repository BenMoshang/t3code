# Ben's personal T3 Code fork

Fork: https://github.com/BenMoshang/t3code

Use `my-features` for personal changes. `main` follows `pingdotgg/t3code`.
`origin` points to your fork; `upstream` reads the official repository and has
its push URL disabled. Sync uses merges, so pushed feature history is preserved.

## Run the custom app

From this checkout in PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/custom.ps1 Dev
```

This starts the source desktop app and its development services. Closing this
command stops those services. Its data lives in `.t3/custom-home`; the first run
starts empty. Connect providers in this app as needed. It does not run against
the installed Nightly's live database. The development app's updater is disabled.

The installed **T3 Code (Nightly)** keeps receiving official automatic updates.
Those updates do not modify this source checkout. Updates to the custom app
come from syncing upstream source and rebuilding; official downloaded binaries
do not contain your personal features.

## Update the custom app

Stop its development services and commit your work first:

```powershell
git add <the-files-you-changed>
git commit -m "feat: describe your feature"
git push origin my-features
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/custom.ps1 Sync
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/custom.ps1 Setup
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/custom.ps1 Check
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/custom.ps1 Build
git push origin my-features
```

`Sync` fetches current official `main`, fast-forwards your clean `main`, pushes
that branch to your fork, then merges it into `my-features`. This follows the
latest development source, which can be ahead of a published Nightly. If a
feature conflicts, the merge is aborted and the feature branch remains intact;
run `git merge main` to resolve the conflict deliberately. Sync never force-pushes.

`Setup` installs the versions pinned by upstream into `.t3/toolchain`, then
installs dependencies with the frozen lockfile. It does not change global Node.
`Check` runs upstream's checks for changed files. `Build` builds the desktop and
server locally; it does not install a Windows package. Run `Dev` to use your app.

## Other local work

The existing `~/t3code-omp` and `~/t3code-omp-zoom` checkouts contain uncommitted
features. They were preserved and have not been imported into this branch.

The Kimi shim and installed-Nightly patch have their own private source backup:
https://github.com/BenMoshang/kimi-t3-acp. They remain active at
`~/AppData/Local/kimi-t3-acp`. Official updates can still replace an installed
archive patch; follow that repository's activation instructions when needed.
