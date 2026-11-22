/**
 * Paths only vulnerability scanners ask for: PHP files, WordPress, dotfiles
 * such as /.env and /.git/config, and backup or secret files. This app serves
 * none of them, so the proxy answers with a bare 404 the CDN can cache instead
 * of starting a render of the full not-found page for each probe.
 *
 * Must never match a real route or a file in public/ (.json and .txt files,
 * /.well-known/*). The tests pin both sides.
 */
const PHP = /\.ph(p\d?|tml)$/i;
// Any path segment starting with a dot, except /.well-known.
const DOTFILE = /(^|\/)\.(?!well-known(\/|$))[^/]/;
const CMS = /^\/(wp-|wordpress|xmlrpc|phpmyadmin|pma(\/|$)|myadmin|adminer|cgi-bin)/i;
const BACKUP_OR_SECRET =
  /\.(bak|old|orig|swp|sql|tfvars|tfstate|env|ini|cfg|conf|config|properties|pem|key|p12|zip|tar|gz|rar|7z|log|ya?ml|plist)$/i;

export function isProbePath(pathname: string): boolean {
  return (
    PHP.test(pathname) ||
    DOTFILE.test(pathname) ||
    CMS.test(pathname) ||
    BACKUP_OR_SECRET.test(pathname)
  );
}
