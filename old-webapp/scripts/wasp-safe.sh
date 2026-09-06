#!/usr/bin/env bash
# Run Wasp without inheriting the developer-machine npm user config.
#
# Some npm versions reject `allow-scripts` when Wasp invokes npm inside its
# generated project. A clean temporary user config preserves this repository's
# .npmrc while keeping global/user-level npm settings out of Wasp commands.
set -euo pipefail

wasp_npmrc=$(mktemp "${TMPDIR:-/tmp}/actionamp-wasp-npmrc.XXXXXX")
trap 'rm -f "$wasp_npmrc"' EXIT

NPM_CONFIG_USERCONFIG="$wasp_npmrc" wasp "$@"
