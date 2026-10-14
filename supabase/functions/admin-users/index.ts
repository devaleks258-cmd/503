import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: 'Нужен вход' }, 401);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: me } = await admin.from('profiles').select('role,active').eq('id', user.id).single();
    if (!me || me.role !== 'admin' || !me.active) return json({ error: 'Только администратор' }, 403);

    const b = await req.json();
    const domain = 'sklad.internal'; // = settings.login_domain; клиент входит как <login>@sklad.internal

    const loadTarget = async () => {
      const { data } = await admin.from('profiles').select('id,role').eq('id', b.id).single();
      return data && data.role === 'supervisor' ? data : null;
    };

    switch (b.action) {
      case 'list': {
        const { data, error } = await admin.from('profiles')
          .select('id,login,full_name,active,created_at').eq('role', 'supervisor').order('created_at');
        if (error) return json({ error: error.message }, 400);
        return json({ users: data });
      }
      case 'create': {
        const login = String(b.login ?? '').trim().toLowerCase();
        const password = String(b.password ?? '');
        const fullName = String(b.full_name ?? '').trim();
        if (!/^[a-z0-9._-]{3,32}$/.test(login)) return json({ error: 'Логин: 3–32 символа a-z, 0-9, . _ -' }, 400);
        if (password.length < 8) return json({ error: 'Пароль не короче 8 символов' }, 400);
        if (!fullName) return json({ error: 'Укажите имя' }, 400);
        const { data: created, error } = await admin.auth.admin.createUser({
          email: `${login}@${domain}`, password, email_confirm: true,
        });
        if (error || !created.user) return json({ error: error?.message ?? 'Не удалось создать' }, 400);
        const { error: pe } = await admin.from('profiles').insert({
          id: created.user.id, login, full_name: fullName, role: 'supervisor',
        });
        if (pe) { await admin.auth.admin.deleteUser(created.user.id); return json({ error: pe.message }, 400); }
        return json({ id: created.user.id, login });
      }
      case 'set_password': {
        if (!(await loadTarget())) return json({ error: 'Пользователь не найден' }, 404);
        if (String(b.password ?? '').length < 8) return json({ error: 'Пароль не короче 8 символов' }, 400);
        const { error } = await admin.auth.admin.updateUserById(b.id, { password: b.password });
        return error ? json({ error: error.message }, 400) : json({ ok: true });
      }
      case 'set_active': {
        if (!(await loadTarget())) return json({ error: 'Пользователь не найден' }, 404);
        const active = !!b.active;
        const { error } = await admin.auth.admin.updateUserById(b.id, { ban_duration: active ? 'none' : '876000h' });
        if (error) return json({ error: error.message }, 400);
        await admin.from('profiles').update({ active }).eq('id', b.id);
        return json({ ok: true });
      }
      case 'rename': {
        if (!(await loadTarget())) return json({ error: 'Пользователь не найден' }, 404);
        await admin.from('profiles').update({ full_name: String(b.full_name ?? '').trim() }).eq('id', b.id);
        return json({ ok: true });
      }
      case 'delete': {
        if (!(await loadTarget())) return json({ error: 'Пользователь не найден' }, 404);
        const { error } = await admin.auth.admin.deleteUser(b.id);
        return error ? json({ error: error.message }, 400) : json({ ok: true });
      }
      default:
        return json({ error: 'Неизвестное действие' }, 400);
    }
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
