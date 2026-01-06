> This guide was written by @bgtlover:stealthy.club, a community contributor. The author of Out Of Your Element hopes it will be useful, but cannot say whether the information is accurate or complete.

## Example reverse proxy configuration with traefik

Note: This guide describes setting up the reverse proxy configuration when OOYE is ***not*** in a Docker container.

Because traefik is generally used in Docker, this guide assumes the user already has it configured properly. However, given that Docker is very complex and the smallest mistakes can cascade in catastrophic, not immediately observable, and unpredictable ways, a fairly complete setup will be reproduced. Therefore, system administrators are advised to diff this sample setup against theirs rather than copy it wholesale.

### Note on variable substitution

Variables will be denoted as `{{var}}`. This syntax has been chosen because that's also how YAML substitution works. The values that fit each variable will be explained after the code block containing the placeholder.

### Base compose configuration for traefik

This file defines the traefik service stack. It's responsible for mounting volumes correctly, declaring ports that should be opened on the host side, and the external traefik network (created manually).

In compose.yml, put the following:

```yaml
services:
  traefik:
    image: "traefik:latest"
    restart: always
    command:
      - "--configFile=/etc/traefik/static_config.yml"
    ports:
      - "80:80"   #http
      - "443:443" #https
    networks:
      - traefik
    volumes:
      - ./letsencrypt:/letsencrypt
      - /etc/localtime:/etc/localtime:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./static_config.yml:/etc/traefik/static_config.yml
      - ./config:/etc/traefik/config
networks:
  traefik:
    external: true
```

### Static traefik configuration

The static traefik configuration is used to define base traefik behavior, for example entry points, access and runtime logs, a file or directory for per-service configuration, etc.

In static_config.yml, put the following:

```yaml
api:
  dashboard: true

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
    network: "traefik"
  file:
    directory: /etc/traefik/config/
    watch: true

entryPoints:
  web-secure:
    address: ":443"
    asDefault: true
    http3: {}
    http:
      tls:
        certResolver: default
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: web-secure

certificatesResolvers:
  default:
    acme:
      email: {{email}}
      storage: "/letsencrypt/acme.json"
      tlsChallenge: {}

```

Replace `{{email}}` with a valid email address.

### Out of your element traefik dynamic configuration

Traefik's dynamic configuration files configure proxy behaviors on a per-application level.

In config/out-of-your-element.yml, put the following:

```yaml
http:
  routers:
    out-of-your-element:
      rule: Host(`bridge.stealthy.club`)
      service: out-of-your-element-service
  services:
    out-of-your-element-service:
      loadBalancer:
        servers:
          - url: "http://{{ip}}:{{port}}"

```

The `{{port}}` is 6693 unless you changed it during Out Of Your Element's first time setup.

Replace `{{ip}}` with the ***external*** IP of your server.

Make sure the port is allowed through your firewall if applicable.

For context, the external IP is required because of Docker networking. Because Docker modifies the host-side iptables firewall and creates virtual interfaces for its networks, and because the networking inside containers is configured such that localhost points to the IP of the container instead of the actual host, placing localhost in the url field above would make the traefik container establish an HTTP connection to itself, which would cause a bad gateway error.
