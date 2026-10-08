# ZOZ Pro Runtime — Vercel-independent

## Runtime policy

Vercel is optional. A Vercel rate limit or preview failure must never block ZOZ Pro development or local operation.

Authoritative runtime for the current local-first phase:

Phone -> Tailscale Serve -> Windows ZOZ Pro server -> Codex Executor

The authoritative state remains on the Windows machine. A free cloud filesystem must not be treated as the primary state store.

## Windows setup

1. Install Tailscale on Windows and sign in to the same account used by the phone.
2. Set the owner token in PowerShell:

   $env:ZOZ_CONTROL_TOKEN="<YOUR_OWNER_TOKEN>"

3. From the ZOZ Pro repository run:

   .\scripts\start-zoz-pro-tailnet.ps1

4. Run:

   tailscale serve status

5. Open the private HTTPS URL shown for port 3000 on the phone.

## Codex Executor

Keep the Codex Executor local to the Windows checkout. It can use the local loopback URL:

   $env:ZOZ_PRO_CONTROL_URL="http://127.0.0.1:3000"
   .\scripts\start-codex-executor.ps1

The phone uses the private Tailscale URL. Codex uses the local loopback URL on the same computer.

## Security

Use Tailscale Serve, not Funnel, for the owner control plane. Serve keeps access within the tailnet; Funnel exposes the service to the public internet.
The existing bearer token remains required for API requests.

## Optional public preview

Render can host a free Node web service for testing, but its free service can spin down and its local filesystem is ephemeral. Render is therefore a preview option, not the authoritative stateful runtime for the current architecture.

## Vercel

Vercel remains optional for previews. A Vercel deployment failure is not a runtime failure and must not be used as the ZOZ Pro operating dependency.