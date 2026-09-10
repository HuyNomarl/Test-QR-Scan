'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { format } from 'date-fns';
import api from '@/utils/api';

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['loyalty-customers', search],
    queryFn: async () => (await api.get('/loyalty/customers', { params: { search } })).data,
  });
  const customers = data?.data || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div><h1 className="text-2xl font-extrabold text-gray-900">Khách hàng tích điểm</h1><p className="text-sm text-gray-400 mt-1">Danh sách được cập nhật sau mỗi lượt quét QR.</p></div>
      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3 items-center justify-between">
          <div className="relative w-full sm:max-w-sm"><Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" /><input className="input w-full pl-9 text-sm" placeholder="Tìm tên, SĐT hoặc quốc gia..." value={search} onChange={e => setSearch(e.target.value)} /></div>
          <span className="text-sm text-gray-500 flex items-center gap-1.5"><Users className="w-4 h-4" />{data?.pagination?.total || 0} khách hàng</span>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase"><th className="px-5 py-3">Khách hàng</th><th className="px-5 py-3">Số điện thoại</th><th className="px-5 py-3">Quốc gia</th><th className="px-5 py-3">Điểm</th><th className="px-5 py-3">Lần quét gần nhất</th></tr></thead><tbody>{isLoading && <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">Đang tải...</td></tr>}{!isLoading && !customers.length && <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">Chưa có khách hàng.</td></tr>}{customers.map(customer => <tr key={customer.id} className="border-b border-gray-50"><td className="px-5 py-3 font-semibold text-gray-800">{customer.full_name}</td><td className="px-5 py-3 text-gray-600">{customer.phone}</td><td className="px-5 py-3 text-gray-600">{customer.country}</td><td className="px-5 py-3"><span className="inline-flex bg-amber-100 text-amber-800 rounded-full px-2.5 py-1 font-bold">{customer.points} điểm</span></td><td className="px-5 py-3 text-gray-500 whitespace-nowrap">{customer.last_earned_at ? format(new Date(customer.last_earned_at), 'dd/MM/yyyy HH:mm') : '—'}</td></tr>)}</tbody></table></div>
      </div>
    </div>
  );
}
