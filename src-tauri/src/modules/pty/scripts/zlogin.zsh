# terax-shell-integration (zlogin)
#
# This is the LAST init file zsh runs before entering the prompt loop, so its
# exit status becomes `$?` for the very first prompt. Without the trailing `:`,
# users without a personal ~/.zlogin (the common case) hit a non-zero $? on
# first render — themes that condition prompt color on `%?` (robbyrussell etc.)
# show a red error indicator on a clean shell start.
{
  _terax_user_zdotdir="${TERAX_USER_ZDOTDIR:-$HOME}"
  _terax_saved_zdotdir="$ZDOTDIR"
  ZDOTDIR="$_terax_user_zdotdir"
  export ZDOTDIR
  [ -f "$_terax_user_zdotdir/.zlogin" ] && source "$_terax_user_zdotdir/.zlogin"
  ZDOTDIR="$_terax_saved_zdotdir"
  export ZDOTDIR
  unset _terax_user_zdotdir _terax_saved_zdotdir
}
:
