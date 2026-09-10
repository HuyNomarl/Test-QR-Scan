import AdminShell from '@/components/admin/AdminShell';

export const metadata = { title: 'Admin — Manikstu Agro' };

export default function AdminLayout({ children }) {
  return <AdminShell>{children}</AdminShell>;
}
