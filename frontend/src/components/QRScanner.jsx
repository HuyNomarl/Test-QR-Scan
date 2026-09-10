'use client';

import { useState } from 'react';
import { CheckCircle2, Gift, Loader2, Sparkles } from 'lucide-react';
import api from '@/utils/api';

const initialForm = { full_name: '', phone: '', country: 'Việt Nam' };

export default function QRScanner() {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  function changeField(event) { const { name, value } = event.target; setForm(current => ({ ...current, [name]: value })); }
  async function submit(event) {
    event.preventDefault(); setError(''); setLoading(true);
    try { const { data } = await api.post('/loyalty/earn', form); setResult(data.data); }
    catch (err) { setError(err.response?.data?.message || 'Không thể ghi nhận điểm. Vui lòng thử lại.'); }
    finally { setLoading(false); }
  }
  function reset() { setForm(initialForm); setResult(null); setError(''); }
  if (result) {
    const customer = result.customer;
    return <main className="min-h-screen gradient-brand flex items-center justify-center p-4"><section className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center animate-fade-in"><div className="w-20 h-20 mx-auto mb-5 rounded-full bg-amber-100 flex items-center justify-center"><Gift className="w-10 h-10 text-amber-600" /></div><p className="text-sm font-semibold text-brand-secondary mb-1">{result.is_new_customer ? 'Chào mừng thành viên mới!' : 'Tích điểm thành công!'}</p><h1 className="text-2xl font-extrabold text-gray-800">Cảm ơn {customer.full_name}</h1><p className="text-gray-500 text-sm mt-2">Bạn vừa nhận thêm <strong>1 điểm</strong>.</p><div className="my-6 rounded-2xl bg-brand-light px-5 py-4"><p className="text-xs font-bold tracking-wider text-brand-secondary uppercase">Tổng điểm hiện có</p><p className="text-5xl font-black text-brand-primary mt-1">{customer.points}</p><p className="text-xs text-gray-500 mt-2">Điểm có thể dùng để đổi quà theo chương trình của cửa hàng.</p></div><button onClick={reset} className="btn-primary w-full">Tích điểm cho khách khác</button></section></main>;
  }
  return <main className="min-h-screen gradient-brand flex items-center justify-center p-4"><section className="bg-white rounded-3xl shadow-2xl p-7 max-w-sm w-full animate-fade-in"><header className="text-center mb-6"><div className="w-16 h-16 mx-auto rounded-2xl bg-amber-100 flex items-center justify-center mb-3 shadow-sm"><Sparkles className="w-8 h-8 text-amber-600" /></div><h1 className="text-2xl font-extrabold text-brand-primary">Tích điểm nhận quà</h1><p className="text-sm text-gray-500 mt-1">Điền thông tin để nhận 1 điểm ngay hôm nay.</p></header><form onSubmit={submit} className="space-y-4"><div><label htmlFor="full_name" className="block text-sm font-semibold text-gray-700 mb-1.5">Họ và tên</label><input id="full_name" name="full_name" className="input w-full" placeholder="Nguyễn Văn A" value={form.full_name} onChange={changeField} required disabled={loading} autoComplete="name" /></div><div><label htmlFor="phone" className="block text-sm font-semibold text-gray-700 mb-1.5">Số điện thoại</label><input id="phone" name="phone" type="tel" className="input w-full" placeholder="Ví dụ: 0901 234 567" value={form.phone} onChange={changeField} required disabled={loading} autoComplete="tel" /></div><div><label htmlFor="country" className="block text-sm font-semibold text-gray-700 mb-1.5">Quốc gia</label><input id="country" name="country" className="input w-full" placeholder="Việt Nam" value={form.country} onChange={changeField} required disabled={loading} autoComplete="country-name" /></div>{error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}<button type="submit" disabled={loading} className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 disabled:opacity-60">{loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}{loading ? 'Đang ghi nhận...' : 'Nhận 1 điểm'}</button></form><p className="text-center text-xs text-gray-400 mt-5">Quét mã QR mỗi lần ghé thăm để tích điểm.</p></section></main>;
}
