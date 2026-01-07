'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import { CalendarIcon, ArrowLeftIcon, ShareIcon } from '@heroicons/react/24/outline';
import { notFound } from 'next/navigation';

export default function BlogDetail({ params }) {
    const [post, setPost] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        fetch(`/api/v1/blog/posts/${params.slug}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setPost(data.data);
                } else {
                    setError(true);
                }
                setLoading(false);
            })
            .catch(() => {
                setError(true);
                setLoading(false);
            });
    }, [params.slug]);

    if (loading) return (
        <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col">
            <Navbar />
            <div className="flex-1 flex items-center justify-center">Loading Article...</div>
        </div>
    );

    if (error || !post) return (
        <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col">
            <Navbar />
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <h1 className="text-3xl font-bold mb-4">Artikel Tidak Ditemukan</h1>
                <Link href="/blog" className="text-blue-600 hover:underline">Kembali ke Blog</Link>
            </div>
        </div>
    );

    return (
        <main className="min-h-screen bg-white dark:bg-slate-950">
            <Navbar />

            {/* Hero / Cover */}
            <div className="relative pt-32 pb-16 bg-slate-100 dark:bg-slate-900">
                <div className="container mx-auto px-6 max-w-4xl">
                    <Link href="/blog" className="inline-flex items-center text-blue-600 mb-6 hover:underline">
                        <ArrowLeftIcon className="w-4 h-4 mr-2" /> Kembali ke Blog
                    </Link>

                    <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-white mb-6 leading-tight">
                        {post.title}
                    </h1>

                    <div className="flex items-center text-slate-500 mb-8 border-b border-slate-200 dark:border-slate-800 pb-8">
                        <div className="flex items-center gap-2 mr-6">
                            <CalendarIcon className="w-5 h-5" />
                            {new Date(post.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                        {post.views > 0 && <span className="text-sm bg-slate-200 dark:bg-slate-800 px-2 py-1 rounded">{post.views} views</span>}
                    </div>

                    {post.cover_image && (
                        <div className="rounded-2xl overflow-hidden shadow-2xl mb-12">
                            <img src={post.cover_image} alt={post.title} className="w-full h-auto" />
                        </div>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="container mx-auto px-6 max-w-4xl py-12">
                <div
                    className="prose prose-lg prose-blue dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: post.content }}
                />

                {/* Share / Footer of Article */}
                <div className="mt-16 pt-8 border-t border-slate-200 dark:border-slate-800">
                    <p className="text-center font-bold text-slate-900 dark:text-white mb-4">Bagikan artikel ini</p>
                    <div className="flex justify-center gap-4">
                        {/* Placeholder Copy Link */}
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(window.location.href);
                                alert('Link copied!');
                            }}
                            className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-blue-100 text-slate-600 hover:text-blue-600 transition"
                        >
                            <ShareIcon className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            </div>

            <Footer />
        </main>
    );
}
