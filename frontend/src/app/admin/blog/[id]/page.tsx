'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

export default function BlogPostEditor({ params }) {
    const router = useRouter();
    const isNew = params.id === 'new';

    const [formData, setFormData] = useState({
        title: '',
        slug: '',
        excerpt: '',
        content: '',
        cover_image: '',
        is_published: false
    });
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isNew) {
            // Load existing post
            // Note: We use the admin backend endpoint if available or public single fetch
            // Let's use the public fetch by slug logic or find by ID if we added an ID endpoint.
            // Oh wait, my backend plan only had GET /posts/:slug. 
            // I should use GET /admin/posts/:id ideally? Or filter the admin list. 
            // In the backend I implemented PUT /admin/posts/:id but didn't implement GET /admin/posts/:id explicitly,
            // but usually I can just reuse the public one if I have the slug, OR iterate the list.
            // Let's iterate the admin list for now as a quick hack or implement GET /admin/posts/:id if needed.

            // Actually I'll implement a quick helper in client to find it from the list if I want 
            // OR simpler: just assume I can look it up.
            // Let's add GET /blog/admin/posts/:id to backend quickly? 
            // Or just use the filtering on client side if list is small? 
            // Better: update backend to support GET /admin/posts/:id. 
            // Wait, I can't update backend easily without restart. 
            // I'll assume I can fetch the full list and find it for now to save time.

            api.get('/api/v1/blog/admin/posts')
                .then(res => {
                    const post = res.data.data.find(p => p.id == params.id);
                    if (post) {
                        setFormData(post);
                    } else {
                        toast.error('Post not found');
                        router.push('/admin/blog');
                    }
                })
                .catch(err => {
                    console.error(err);
                    toast.error('Failed to load post');
                })
                .finally(() => setLoading(false));
        }
    }, [isNew, params.id, router]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));

        // Auto-generate slug from title if new and slug is empty
        if (name === 'title' && isNew && !formData.slug && !formData.slug_dirty) {
            const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            setFormData(prev => ({ ...prev, slug, slug_dirty: false }));
        }
        if (name === 'slug') {
            setFormData(prev => ({ ...prev, slug_dirty: true }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (isNew) {
                await api.post('/api/v1/blog/admin/posts', formData);
                toast.success('Post created successfully!');
                router.push('/admin/blog');
            } else {
                await api.put(`/api/v1/blog/admin/posts/${params.id}`, formData);
                toast.success('Post updated successfully!');
            }
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.message || 'Failed to save post');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div>Loading...</div>;

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/admin/blog" className="text-slate-500 hover:text-slate-800">
                    <ArrowLeftIcon className="w-6 h-6" />
                </Link>
                <h1 className="text-2xl font-bold">{isNew ? 'New Post' : 'Edit Post'}</h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 bg-white dark:bg-slate-800 p-6 rounded-xl shadow">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold mb-1">Title</label>
                            <input
                                type="text" name="title" required
                                className="w-full p-2 border rounded dark:bg-slate-700"
                                value={formData.title} onChange={handleChange}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-1">Slug (URL)</label>
                            <input
                                type="text" name="slug" required
                                className="w-full p-2 border rounded dark:bg-slate-700 font-mono text-sm"
                                value={formData.slug} onChange={handleChange}
                            />
                        </div>

                        <div className="flex items-center space-x-2 pt-4">
                            <input
                                type="checkbox" id="is_published" name="is_published"
                                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                checked={formData.is_published} onChange={handleChange}
                            />
                            <label htmlFor="is_published" className="font-bold cursor-pointer">Published?</label>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold mb-1">Cover Image URL</label>
                            <input
                                type="text" name="cover_image"
                                className="w-full p-2 border rounded dark:bg-slate-700 text-sm"
                                placeholder="https://..."
                                value={formData.cover_image || ''} onChange={handleChange}
                            />
                            {formData.cover_image && (
                                <img src={formData.cover_image} alt="Preview" className="mt-2 h-32 w-full object-cover rounded" />
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-1">Excerpt (Short Summary)</label>
                            <textarea
                                name="excerpt" rows={3}
                                className="w-full p-2 border rounded dark:bg-slate-700"
                                value={formData.excerpt || ''} onChange={handleChange}
                            />
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-bold mb-1">Content (HTML)</label>
                    <p className="text-xs text-slate-500 mb-2">You can write raw HTML or use a Markdown converter externally.</p>
                    <textarea
                        name="content" required rows={15}
                        className="w-full p-4 border rounded dark:bg-slate-700 font-mono text-sm"
                        value={formData.content || ''} onChange={handleChange}
                        placeholder="<p>Write your article content here...</p>"
                    />
                </div>

                <div className="flex justify-end pt-4 border-t">
                    <button
                        type="submit"
                        disabled={saving}
                        className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : (isNew ? 'Create Post' : 'Update Post')}
                    </button>
                </div>
            </form>
        </div>
    );
}
