export function shouldReloadForAdminTransition(from: URL | null, to: URL | null): boolean {
	if (!from || !to || from.origin !== to.origin) return false;

	const fromIsAdmin = from.pathname === '/admin' || from.pathname.startsWith('/admin/');
	const toIsAdmin = to.pathname === '/admin' || to.pathname.startsWith('/admin/');

	return fromIsAdmin !== toIsAdmin;
}
