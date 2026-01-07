'use client';

import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';

export default function TermsPage() {
    return (
        <main className="min-h-screen bg-white dark:bg-slate-950 font-sans">
            <Navbar />

            <div className="pt-32 pb-16 bg-slate-900 dark:bg-black">
                <div className="container mx-auto px-6 text-center">
                    <h1 className="text-4xl font-bold text-white mb-4">Syarat & Ketentuan</h1>
                    <p className="text-slate-400 max-w-2xl mx-auto">
                        Perjanjian penggunaan layanan internet Kilusi.
                    </p>
                </div>
            </div>

            <div className="container mx-auto px-6 py-16">
                <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 p-8 md:p-12 rounded-2xl border border-slate-200 dark:border-slate-800 prose prose-lg dark:prose-invert">
                    <p className="lead">
                        Selamat datang di Kilusi. Dengan berlangganan layanan kami, Anda dianggap telah membaca, memahami, dan menyetujui seluruh syarat dan ketentuan ini.
                    </p>

                    <h3>1. Layanan Internet</h3>
                    <ul>
                        <li>Kami menjamin ketersediaan layanan sesuai dengan paket yang dipilih (Up-to speed).</li>
                        <li>Kecepatan internet bersifat <em>sharing</em> dan dapat dipengaruhi oleh faktor teknis di lokasi.</li>
                        <li>Pelanggan dilarang menggunakan layanan untuk kegiatan ilegal atau melanggar hukum di Indonesia.</li>
                    </ul>

                    <h3>2. Pembayaran & Tagihan</h3>
                    <ul>
                        <li>Tagihan diterbitkan setiap tanggal 1 (atau sesuai siklus billing) setiap bulannya.</li>
                        <li>Pembayaran wajib dilakukan paling lambat tanggal 10.</li>
                        <li>Keterlambatan pembayaran akan dikenakan denda atau isolir sementara sesuai kebijakan perusahaan.</li>
                    </ul>

                    <h3>3. Perangkat & Instalasi</h3>
                    <ul>
                        <li>Perangkat Modem/ONU yang dipinjamkan adalah milik Kilusi dan wajib dikembalikan jika berhenti berlangganan.</li>
                        <li>Kerusakan perangkat akibat kelalaian pelanggan (kena air, petir, pecah) menjadi tanggung jawab pelanggan.</li>
                        <li>Biaya instalasi dibayarkan di awal saat pemasangan.</li>
                    </ul>

                    <h3>4. Pemutusan Layanan</h3>
                    <ul>
                        <li>Pelanggan dapat mengajukan pemutusan layanan kapan saja dengan pemberitahuan minimal 7 hari sebelumnya.</li>
                        <li>Kontrak berlangganan minimal 6 bulan. Pemutusan sebelum masa kontrak berakhir dapat dikenakan biaya penalti.</li>
                    </ul>

                    <div className="mt-12 p-6 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 not-prose">
                        <h4 className="font-bold text-slate-900 dark:text-white mb-2">Butuh Bantuan?</h4>
                        <p className="text-slate-600 dark:text-slate-400 mb-0">
                            Jika ada pertanyaan mengenai syarat dan ketentuan ini, silakan hubungi tim legal kami atau layanan pelanggan di <a href="/support" className="text-blue-600 hover:underline">Halaman Support</a>.
                        </p>
                    </div>
                </div>
            </div>

            <Footer />
        </main>
    );
}
