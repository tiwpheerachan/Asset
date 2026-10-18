'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Check, Lock, Mail, RotateCcw, Search, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useI18n } from '@/lib/i18n';
import { Button, cx } from '@/components/ui';
import { PERMISSION_GROUPS, lockState, canWith, type Permission, type RolePermsMap } from '@/lib/rbac';
import type { Role, AppUser } from '@/lib/types';

const ROLES: Role[] = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'AUDITOR'];
const ROLE_TONE: Record<Role, string> = {
  ADMIN: 'bg-violet-50 text-violet-700 ring-violet-200',
  MANAGER: 'bg-blue-50 text-blue-700 ring-blue-200',
  ACCOUNTANT: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  AUDITOR: 'bg-amber-50 text-amber-700 ring-amber-200',
};
const ALL_PERMS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.perms);
type Person = { union_id: string; name: string; email: string | null; job_title: string | null; departments: string[]; avatar_url: string | null };
type Dept = { dept_id: string; name: string; people: number };

function initialsOf(name: string) {
  return (
    (name || '')
      .split(/\s+/)
      .map((w) => w.match(/[\p{L}\p{N}]/u)?.[0] ?? '')
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

/** รูปโปรไฟล์ + fallback เป็นอักษรย่อ */
function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const [err, setErr] = useState(false);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (src && !err) {
    return (
      <img src={src} alt={name} width={size} height={size} referrerPolicy="no-referrer" onError={() => setErr(true)}
           className="shrink-0 rounded-full object-cover ring-1 ring-line" style={style} />
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 ring-1 ring-brand-200" style={style}>
      {initialsOf(name)}
    </span>
  );
}

export default function AdminUsersPage() {
  const { state, role: myRole, upsertUser, setUserRole, setUserActive, removeUser, setRolePerm, resetRolePerms } = useStore();
  const { t } = useI18n();

  const [view, setView] = useState<'users' | 'perms'>('users');

  // ── typeahead ไดเรกทอรี ──
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [picked, setPicked] = useState<Person | null>(null);
  const [newRole, setNewRole] = useState<Role>('ACCOUNTANT');
  const [newDept, setNewDept] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  // ── ผังแผนกจากระบบกลาง (SSO) ──
  const [depts, setDepts] = useState<Dept[]>([]);
  const [deptFilter, setDeptFilter] = useState('');

  const rolePerms: RolePermsMap = state.rolePerms;
  const me = state.session;

  useEffect(() => {
    let cancelled = false;
    fetch('/api/directory/departments')
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.ok) setDepts((d.items as Dept[]).filter((x) => x.people > 0).sort((a, b) => a.name.localeCompare(b.name))); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (picked && term === picked.name) return;
    if (term.length < 2) { setItems([]); setNote(null); setOpen(false); return; }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      setNote(null);
      try {
        const res = await fetch(`/api/directory/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const data = await res.json();
        setOpen(true);
        if (!data.ok) {
          setItems([]);
          setNote(data.error === 'not_configured' ? 'ยังไม่ได้เชื่อมไดเรกทอรีกลาง — พิมพ์อีเมลเองได้'
            : data.error === 'query_too_short' ? 'พิมพ์อย่างน้อย 2 ตัวอักษร' : 'ค้นหาไม่สำเร็จ — พิมพ์อีเมลเองได้');
          return;
        }
        setItems(data.items ?? []);
        if ((data.items ?? []).length === 0) setNote('ไม่พบในไดเรกทอรี — พิมพ์อีเมลเองได้');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') { setOpen(true); setNote('ค้นหาไม่สำเร็จ — พิมพ์อีเมลเองได้'); }
      }
    }, 300);
    return () => { clearTimeout(id); ctrl.abort(); };
  }, [q, picked]);

  const sortedUsers = useMemo(
    () => [...state.users].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'th')),
    [state.users],
  );
  const userDepts = useMemo(
    () => Array.from(new Set(state.users.map((u) => (u.department || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [state.users],
  );
  const shownUsers = deptFilter ? sortedUsers.filter((u) => (u.department || '') === deptFilter) : sortedUsers;

  if (myRole !== 'ADMIN') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-ink-3" />
        <p className="text-[15px] font-medium text-ink">เฉพาะผู้ดูแลระบบ (ADMIN)</p>
        <p className="mt-1 text-[13px] text-ink-3">คุณไม่มีสิทธิ์จัดการผู้ใช้</p>
      </div>
    );
  }

  const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
  const manualEmail = q.includes('@') ? q.trim().toLowerCase() : null;
  const addTarget: { email: string; name: string; avatar?: string | null; title?: string | null; dept?: string | null } | null =
    picked
      ? { email: picked.email || '', name: picked.name, avatar: picked.avatar_url, title: picked.job_title, dept: picked.departments?.[0] ?? null }
      : manualEmail && emailOk(manualEmail)
        ? { email: manualEmail, name: manualEmail }
        : null;

  const doAdd = () => {
    if (!addTarget || !addTarget.email) return;
    upsertUser({ name: addTarget.name, email: addTarget.email, role: newRole, avatarUrl: addTarget.avatar ?? null, title: addTarget.title ?? null, department: newDept.trim() || addTarget.dept || null });
    setPicked(null); setQ(''); setItems([]); setOpen(false); setNewRole('ACCOUNTANT'); setNewDept('');
  };

  const roleCount = (r: Role) => ALL_PERMS.filter((p) => canWith(rolePerms, r, p)).length;

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 md:px-8">
      {/* ── หัวเรื่อง + โปรไฟล์ของฉัน ── */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
            <Users size={20} />
          </span>
          <div>
            <h1 className="text-[20px] font-semibold text-ink">ผู้ใช้และสิทธิ์</h1>
            <p className="mt-0.5 text-[13px] text-ink-3">ค้นหาพนักงานจากระบบกลางแล้วให้สิทธิ์ · ทุกคนล็อกอินผ่าน SSO · บทบาทและสิทธิ์ที่ตั้งที่นี่เป็นตัวตัดสินตอนเข้าใช้</p>
          </div>
        </div>
        {me && (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-white px-3.5 py-2 shadow-card">
            <Avatar name={me.name} src={me.avatarUrl} size={40} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13.5px] font-medium text-ink">{me.name}</span>
                <span className={cx('rounded-full px-1.5 py-0.5 text-[10.5px] font-medium ring-1 ring-inset', ROLE_TONE[myRole])}>{t(`role.${myRole}`)}</span>
              </div>
              <div className="truncate text-[11.5px] text-ink-3">{[me.title, me.department].filter(Boolean).join(' · ') || 'บัญชีของคุณ (เข้าสู่ระบบด้วย SSO)'}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── แท็บหลัก ── */}
      <div className="mb-5 flex gap-1 border-b border-line">
        {([['users', `ผู้ใช้ (${state.users.length})`], ['perms', 'สิทธิ์ตามบทบาท']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setView(k)}
            className={cx('relative -mb-px border-b-2 px-4 py-2.5 text-[13.5px] font-medium transition-colors',
              view === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-3 hover:text-ink')}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'users' ? (
        <div className="space-y-5">
          {/* เพิ่มผู้ใช้ */}
          <section className="rounded-xl border border-line bg-white p-4 shadow-card md:p-5">
            <p className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-ink"><UserPlus size={15} className="text-brand-600" /> เพิ่มผู้ใช้ / ให้สิทธิ์</p>
            <div className="flex flex-wrap items-end gap-2">
              <div ref={boxRef} className="relative min-w-[280px] flex-1">
                <label className="mb-1 block text-[11.5px] text-ink-3">ค้นหาพนักงาน (ชื่อ) หรือพิมพ์อีเมล</label>
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
                  <input
                    value={q}
                    onChange={(e) => { setQ(e.target.value); setPicked(null); }}
                    onFocus={() => items.length > 0 && setOpen(true)}
                    placeholder="พิมพ์ชื่อหรืออีเมล…"
                    className="w-full rounded-lg border border-line bg-white py-2 pl-8 pr-3 text-[13px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                    autoComplete="off"
                  />
                </div>
                {open && (
                  <div className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-line bg-white py-1 shadow-lg">
                    {note && <div className="px-3 py-2 text-[11.5px] text-ink-3">{note}</div>}
                    {items.map((p) => (
                      <button
                        key={p.union_id}
                        type="button"
                        disabled={!p.email}
                        onClick={() => { if (p.email) { setPicked(p); setQ(p.name); setNewDept(p.departments?.[0] ?? ''); setOpen(false); } }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-canvas disabled:opacity-40"
                      >
                        <Avatar name={p.name} src={p.avatar_url} size={34} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-ink">{p.name}</span>
                          <span className="block truncate text-[11px] text-ink-3">
                            {p.email || '— ไม่มีอีเมล —'}{p.job_title ? ` · ${p.job_title}` : ''}{p.departments?.[0] ? ` · ${p.departments[0]}` : ''}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="min-w-[160px]">
                <label className="mb-1 block text-[11.5px] text-ink-3">แผนก{depts.length > 0 ? ` (${depts.length} แผนกจากระบบกลาง)` : ''}</label>
                <input
                  value={newDept}
                  onChange={(e) => setNewDept(e.target.value)}
                  list="fa-dept-list"
                  placeholder="เลือก/พิมพ์แผนก"
                  className="w-full rounded-lg border border-line bg-white px-2.5 py-2 text-[13px] outline-none focus:border-brand-500"
                />
                <datalist id="fa-dept-list">
                  {depts.map((d) => <option key={d.dept_id} value={d.name}>{`${d.people} คน`}</option>)}
                </datalist>
              </div>

              <div>
                <label className="mb-1 block text-[11.5px] text-ink-3">บทบาท</label>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}
                        className="rounded-lg border border-line bg-white px-2.5 py-2 text-[13px] outline-none focus:border-brand-500">
                  {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
                </select>
              </div>

              <Button variant="primary" onClick={doAdd} disabled={!addTarget?.email}>เพิ่มผู้ใช้</Button>
            </div>

            {addTarget?.email && (
              <div className="mt-3 flex items-center gap-2.5 rounded-lg bg-canvas px-3 py-2">
                <Avatar name={addTarget.name} src={addTarget.avatar} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-ink">{addTarget.name}</div>
                  <div className="truncate text-[11.5px] text-ink-3">{addTarget.email}{addTarget.title ? ` · ${addTarget.title}` : ''}</div>
                </div>
                <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', ROLE_TONE[newRole])}>{t(`role.${newRole}`)}</span>
              </div>
            )}
          </section>

          {/* รายชื่อผู้ใช้ (กริดเต็มความกว้าง) */}
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-ink">รายชื่อผู้ใช้</span>
              <div className="flex items-center gap-2">
                {userDepts.length > 0 && (
                  <select
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}
                    className="rounded-lg border border-line bg-white px-2 py-1 text-[12px] text-ink-2 outline-none focus:border-brand-500"
                    title="กรองตามแผนก"
                  >
                    <option value="">ทุกแผนก</option>
                    {userDepts.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                )}
                <span className="rounded-full bg-canvas px-2 py-0.5 text-[11.5px] text-ink-3">{shownUsers.length}{deptFilter ? ` / ${state.users.length}` : ''} คน</span>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {shownUsers.map((u: AppUser) => (
                <div key={u.id} className={cx('flex items-center gap-3 rounded-xl border border-line bg-white p-3 shadow-card', !u.active && 'opacity-60')}>
                  <Avatar name={u.name} src={u.avatarUrl} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13.5px] font-medium text-ink">{u.name}</span>
                      {u.id === me?.userId && <span className="rounded bg-brand-50 px-1.5 text-[10.5px] font-medium text-brand-700">คุณ</span>}
                    </div>
                    <div className="flex items-center gap-1 truncate text-[11px] text-ink-4"><Mail size={11} /> <span className="truncate font-mono">{u.email}</span></div>
                    {(u.title || u.department) && (
                      <div className="flex items-center gap-1 truncate text-[11px] text-ink-3"><Building2 size={11} /> <span className="truncate">{[u.title, u.department].filter(Boolean).join(' · ')}</span></div>
                    )}
                    <div className="mt-2 flex items-center gap-1.5">
                      <select
                        value={u.role}
                        onChange={(e) => setUserRole(u.id, e.target.value as Role)}
                        className="rounded-lg border border-line bg-white px-2 py-1 text-[12px] outline-none focus:border-brand-500"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
                      </select>
                      <button
                        onClick={() => setUserActive(u.id, !u.active)}
                        className={cx('rounded-full px-2 py-1 text-[11px] font-medium ring-1 ring-inset',
                          u.active ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-line-soft text-ink-3 ring-line')}
                      >
                        {u.active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                      </button>
                      <button
                        onClick={() => removeUser(u.id)}
                        disabled={u.id === me?.userId}
                        title={u.id === me?.userId ? 'ลบตัวเองไม่ได้' : 'ลบผู้ใช้'}
                        className="ml-auto rounded-lg p-1.5 text-ink-4 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        /* ── แท็บสิทธิ์ตามบทบาท: เมทริกซ์เต็มความกว้าง ── */
        <section className="rounded-xl border border-line bg-white p-4 shadow-card md:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink"><ShieldCheck size={15} className="text-brand-600" /> สิทธิ์ของแต่ละบทบาท</p>
              <p className="mt-0.5 text-[12px] text-ink-3">ติ๊กว่าแต่ละบทบาทเข้าถึง/ทำอะไรได้บ้าง · มีผลกับผู้ใช้ทุกคนในบทบาทนั้นทันที</p>
            </div>
            <button onClick={resetRolePerms} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-ink-2 transition-colors hover:bg-canvas">
              <RotateCcw size={13} /> คืนค่าเริ่มต้น
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line bg-canvas">
                  <th className="sticky left-0 z-10 bg-canvas px-3 py-2.5 text-left text-[12px] font-semibold text-ink-2">สิทธิ์การใช้งาน</th>
                  {ROLES.map((r) => (
                    <th key={r} className="px-3 py-2.5 text-center">
                      <div className={cx('mx-auto inline-flex flex-col items-center rounded-lg px-2.5 py-1 ring-1 ring-inset', ROLE_TONE[r])}>
                        <span className="text-[12.5px] font-semibold">{t(`role.${r}`)}</span>
                        <span className="text-[10.5px] opacity-80">{roleCount(r)}/{ALL_PERMS.length}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_GROUPS.map((group) => (
                  <Fragment key={group.group}>
                    <tr className="border-b border-line bg-line-soft/60">
                      <td colSpan={1 + ROLES.length} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-4">
                        {t(`perm.group_${group.group}`)}
                      </td>
                    </tr>
                    {group.perms.map((p: Permission) => (
                      <tr key={p} className="border-b border-line/60 hover:bg-brand-50/30">
                        <td className="sticky left-0 z-10 bg-white px-3 py-2.5">
                          <div className="text-[13px] font-medium text-ink">{t(`perm.${p}`)}</div>
                          <div className="text-[11px] text-ink-3">{t(`perm.${p}_desc`)}</div>
                        </td>
                        {ROLES.map((r) => {
                          const lock = lockState(r, p);
                          const on = canWith(rolePerms, r, p);
                          const editable = lock === null;
                          return (
                            <td key={r} className="px-3 py-2.5 text-center">
                              <button
                                type="button"
                                disabled={!editable}
                                onClick={() => editable && setRolePerm(r, p, !on)}
                                aria-pressed={on}
                                title={lock === 'on' ? 'ล็อก: เปิดเสมอ' : lock === 'off' ? 'ล็อก: ปิดเสมอ' : on ? 'คลิกเพื่อปิด' : 'คลิกเพื่อเปิด'}
                                className={cx('inline-flex h-6 w-6 items-center justify-center rounded-md border transition',
                                  on ? 'border-brand-500 bg-brand-500 text-white' : 'border-line bg-white',
                                  editable ? 'hover:border-brand-500' : 'cursor-not-allowed opacity-70')}
                              >
                                {!editable ? <Lock size={12} className={on ? 'text-white' : 'text-ink-4'} /> : on ? <Check size={14} strokeWidth={3} /> : null}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-ink-3">
            <Lock size={12} /> ช่องที่ล็อก: “จัดการผู้ใช้” เปิดเฉพาะผู้ดูแลระบบ · “ลบบันทึกการตรวจสอบ” ปิดตายทุกบทบาท (append-only)
          </p>
        </section>
      )}
    </div>
  );
}
