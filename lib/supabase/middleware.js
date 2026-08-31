import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vlyykdchyqydttktibyi.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_5JAQgYo3pnLwHYqWUk4GZw_585Uvpsd';

export async function updateSession(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isLoginPage = pathname.startsWith('/login');
  const isPublicPage = pathname === '/' || pathname === '/index.html' || pathname === '/about';

  if (!user && !isLoginPage && !isPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && isLoginPage) {
    // Always funnel through /waiting, even for an already-signed-in visitor
    // (e.g. hitting /login with a valid session cookie). /waiting is the
    // only place seats get claimed, and /chat itself refuses to render
    // unless it was reached that way.
    const url = request.nextUrl.clone();
    url.pathname = '/waiting';
    return NextResponse.redirect(url);
  }

  return response;
}
