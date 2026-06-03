# terax-shell-integration (zprofile)
#
# See zshenv.zsh for the rationale on the trailing `:`.
{
  _terax_user_zdotdir="${TERAX_USER_ZDOTDIR:-$HOME}"
  _terax_saved_zdotdir="$ZDOTDIR"
  ZDOTDIR="$_terax_user_zdotdir"
  export ZDOTDIR
  [ -f "$_terax_user_zdotdir/.zprofile" ] && source "$_terax_user_zdotdir/.zprofile"
  ZDOTDIR="$_terax_saved_zdotdir"
  export ZDOTDIR
  unset _terax_user_zdotdir _terax_saved_zdotdir
}
:
