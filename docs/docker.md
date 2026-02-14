# Docker policy

**Out Of Your Element has no official support for Docker. There are no official files or images. If you choose to run Out Of Your Element in Docker, you must disclose this when asking for support. I may refuse to provide support/advice at any time. I may refuse to acknowledge issue reports.**

This also goes for Podman, Nix, and other similar technology that upends a program's understanding of what it's running on.

## What I recommend

I recommend [following the official setup guide,](https://gitdab.com/cadence/out-of-your-element/src/branch/main/docs/get-started.md) which does not use Docker.

Ultimately, though, do what makes you happy. I can't stop you from doing what you want. As long as you read this page and understand my perspective, that's good enough for me.

## Why I advise against Docker

When misconfigured, Docker has terrible impacts. It can cause messages to go missing or even permanent data loss. These have happened to people.

Docker also makes it much harder for me to advise on debugging because it puts barriers between you and useful debugging tools, such as stdin, the database file, a shell, and the inspector. It's also not clear which version of the source code is running in the container, as there are many pieces of Docker (builder, container, image) that can cache old data, often making it so you didn't actually update when you thought you did. This has happened to people.

## Why I don't provide a good configuration myself

It is not possible for Docker to be correctly configured by default. The defaults are broken and will cause data loss.

It is also not possible for me to provide a correct configuration for everyone. Even if I provided a correct image, the YAMLs and command-line arguments must be written by individual end users. Incorrect YAMLs and command-line arguments may cause connection issues or permanent data loss.

## Why I don't provide assistance if you run OOYE in Docker

Problems you encounter, especially with the initial setup, are much more likely to be caused by nuances in your Docker setup than problems in my code. Therefore, my code is not responsible for the problem. The cause of the problem is different code that I can't advise on.

Also, if you reported an issue and I asked for additional information to help find the cause, you might be unable to provide it because of the debugging barriers discussed above.

## Why I don't provide Docker resources

I create OOYE unpaid in my spare time because I enjoy the process. I find great enjoyment in creating code and none at all in creating infrastructure.

## Why you're probably fine without Docker

### If you care about system footprint

OOYE was designed to be simple and courteous:

* It only creates files in its working directory
* It does not require any other processes to be running (e.g., no dependency on a Postgres process)
* It only requires node/npm executables in PATH, which you can store in any folder if you don't want to use your package manager

### If you care about ease of setup

In my opinion, the [official setup process](https://gitdab.com/cadence/out-of-your-element/src/branch/main/docs/get-started.md) is straightforward. After installing prerequisites (Node.js and the repo clone), the rest of the process interactively guides you through providing necessary information. Your input is checked for correctness so the bridge will definitely work when you run it.

I find this easier than the usual Docker workflow of pasting values into a YAML and rolling the dice on whether it will start up or not.

### If you care about security in the case of compromise/RCE

There are no known vulnerabilities in dependencies. I [carefully selected simple, light dependencies](https://gitdab.com/cadence/out-of-your-element/src/branch/main/docs/developer-orientation.md#dependency-justification) to reduce attack surface area.

For defense in depth, I suggest running OOYE as a different user.

### If you want to see all the processes when you run docker ps

Well, you got me there.

## Unofficial, independent, community-provided container setups

I acknowledge the demand for using OOYE in a container, so I will still point you in the right direction.

I had no hand in creating these and have not used or tested them whatsoever. I make no assurance that these will work reliably, or even at all. If you use these, you must do so with the understanding that if you run into any problems, **you must ask for support from the author of that setup, not from me, because you're running their code, not mine.**

***The following list is distributed for your information, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.***

- by melody: https://git.shork.ch/docker-images/out-of-your-element
- by sim2kid: https://github.com/sim2kid/ooye-docker
- by Katharos Technology: https://github.com/katharostech/docker_ooye
- by Emma: https://cgit.rory.gay/nix/OOYE-module.git/tree

## Making your own Docker setup

If you decide to make your own, I may provide advice or indicate problems at my discretion. You acknowledge that I am not required to provide evidence of problems I indicate, nor solutions to them. You acknowledge that it is not possible for me to exhaustively indicate every problem, so I cannot indicate correctness. Even if I have provided advice to an unofficial, independent, community-provided setup, I do not endorse it.
