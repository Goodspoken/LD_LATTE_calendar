# Deployment & Infrastructure Info - Calendar Project

This file contains the configuration and routing details for deploying the FastAPI backend and setting up Git for the interactive calendar project.

---

## 1. SSH Keys & Server Access

SSH keys and configurations have been set up in `/home/vscode/.ssh/config` inside the sandbox, enabling direct SSH connections via standard aliases:

| Host Alias | Host IP | SSH Port | User | Identity File | Status |
| --- | --- | --- | --- | --- | --- |
| **`serverbook`** | `192.168.1.2` | `22` | `illz` | `~/.ssh/id_ed25519` | ✅ Connected & verified |
| **`ihor`** | `95.214.8.10` | `2201` | `admin` | `~/.ssh/id_ed25519` | ✅ Connected & verified |
| **`clouvider`** | `213.255.246.146` | `2203` | `illz` | `~/.ssh/id_ed25519` | ✅ Connected & verified |
| **`aeza`** | `109.120.134.188` | `22` | `admin` | `~/.ssh/id_rsa_aeza` | ❌ Key rejected / IP blocked (replaced by Clouvider in active ecosystem) |
| **`github.com`** | `github.com` | `22` | `git` | `~/.ssh/id_ed25519` | ✅ Configured |

*All key files (`id_ed25519`, `id_rsa_aeza`) have been copied from the host and permissions set to `600`.*

---

## 2. Web Server & Routing Configuration (Caddy / Docker)

### Web Server Layouts
1. **Ihor (`95.214.8.10`)**:
   - Runs a native **Caddy** systemd service (`/etc/caddy/Caddyfile`).
   - Reverse proxies the domain `gskinfo.ru` to Serverbook's WAN IP (`188.242.243.152:8503`).
2. **Clouvider (`213.255.246.146`)**:
   - Runs a **Caddy** Docker container (`gsk-caddy`).
   - Configuration is bound to `/home/illz/caddy/Caddyfile`.
   - Handles `claytablet.online`, reverse proxying `/api/*` to `localhost:8555`, and serving frontend static files from `/home/illz/claytablet/frontend/dist`.
3. **Serverbook (`192.168.1.2`)**:
   - Runs multiple Docker containers.
   - `gsk-caddy` container maps port `8503` to `gsk-frontend:3000` to handle traffic forwarded from Ihor.

### Proposed Ports for FastAPI Calendar Backend
To avoid port conflicts on target servers, the backend can be deployed on the following recommended ports:
* **Serverbook**: Port **`8507`** or **`8001`** (port `8080`, `8089`, `8501-8503`, `8505-8506` are occupied).
* **Clouvider**: Port **`8000`** or **`8507`** (port `8555` is occupied by Claytablet API).
* **Ihor**: Port **`8000`** or **`8080`** (ports `8443/8444` are occupied by MTProto).

---

## 3. Git & GitHub Setup

* Global Git configuration has been written to `/home/vscode/.gitconfig`:
  - **User Name**: `Goodspoken`
  - **User Email**: `happyrussian1@gmail.com`
* A local Git repository has been initialized in this folder (`/home/vscode/projects/calendar/`).
* Remote repository configuration can be added via `git remote add origin git@github.com:Goodspoken/<repo-name>.git` once the repository is created on GitHub.
