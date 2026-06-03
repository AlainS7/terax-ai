# terax-shell-integration (zshenv)
#
# Trailing `:` is load-bearing — without it, a missing user .zshenv leaves $?=1,
# which propagates through the rest of init and ultimately into the first
# prompt's `%?` (rendering robbyrussell's `➜` red on a clean shell start).
{
  _terax_user_zdotdir="${TERAX_USER_ZDOTDIR:-$HOME}"
  _terax_saved_zdotdir="$ZDOTDIR"
  ZDOTDIR="$_terax_user_zdotdir"
  export ZDOTDIR
  [ -f "$_terax_user_zdotdir/.zshenv" ] && source "$_terax_user_zdotdir/.zshenv"
  ZDOTDIR="$_terax_saved_zdotdir"
  export ZDOTDIR
  unset _terax_user_zdotdir _terax_saved_zdotdir
}
:
