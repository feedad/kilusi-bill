'use client';
import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { Tab } from '@headlessui/react';
import { PlusIcon, TrashIcon, PhotoIcon } from '@heroicons/react/24/outline';

import { api, endpoints } from '@/lib/api';

function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
}

export default function LandingContentAdmin() {
    const [content, setContent] = useState({
        hero: { headline: '', subheadline: '', ctaText: '' },
        features: [],
        testimonials: [],
        banners: [],
        pricing: { packageIds: [] }, // Init pricing
        footer: { about: '', copyright: '', social: { fb: '', ig: '', wa: '' } }
    });
    const [loading, setLoading] = useState(true);

    // Fetch initial content
    useEffect(() => {
        // Use authenticated api client
        api.get('/api/v1/landing/content')
            .then(res => {
                const data = res.data;
                if (data.success) {
                    // Ensure defaults
                    const loaded = data.data;
                    if (!loaded.hero) loaded.hero = { headline: '', subheadline: '', ctaText: '' };
                    if (!loaded.features) loaded.features = [];
                    if (!loaded.testimonials) loaded.testimonials = [];
                    if (!loaded.banners) loaded.banners = [];
                    if (!loaded.footer) loaded.footer = { about: '', copyright: '', social: { fb: '', ig: '', wa: '' } };
                    setContent(loaded);
                }
            })
            .finally(() => setLoading(false));
    }, []);

    const saveSection = async (sectionKey, sectionData) => {
        try {
            const res = await api.put('/api/v1/landing/content', {
                section: sectionKey, content: sectionData
            });
            const data = res.data;
            if (data.success) {
                toast.success(`${sectionKey} updated successfully`);
            } else {
                toast.error(data.message || 'Update failed');
            }
        } catch (err) {
            toast.error('Failed to save');
        }
    };

    if (loading) return <div className="p-8">Loading...</div>;

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <h1 className="text-2xl font-bold mb-6 text-slate-800 dark:text-white">Landing Page Content Manager</h1>

            <Tab.Group>
                <Tab.List className="flex space-x-1 rounded-xl bg-blue-900/20 p-1 mb-6">
                    {['General / Hero', 'Banners', 'Features', 'Pricing', 'Testimonials', 'Footer'].map((category) => (
                        <Tab
                            key={category}
                            className={({ selected }) =>
                                classNames(
                                    'w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-blue-700',
                                    'ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2',
                                    selected
                                        ? 'bg-white shadow'
                                        : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'
                                )
                            }
                        >
                            {category}
                        </Tab>
                    ))}
                </Tab.List>
                <Tab.Panels>
                    {/* HERO PANEL */}
                    <Tab.Panel className="rounded-xl bg-white dark:bg-slate-800 p-6 shadow ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2">
                        <div className="space-y-4">
                            <h3 className="text-lg font-medium">Hero Section</h3>
                            <div>
                                <label className="block text-sm font-medium mb-1">Headline</label>
                                <input
                                    type="text"
                                    className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600"
                                    value={content.hero.headline}
                                    onChange={(e) => setContent({ ...content, hero: { ...content.hero, headline: e.target.value } })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Sub-Headline</label>
                                <textarea
                                    className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600"
                                    value={content.hero.subheadline}
                                    onChange={(e) => setContent({ ...content, hero: { ...content.hero, subheadline: e.target.value } })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Button Text</label>
                                <input
                                    type="text"
                                    className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600"
                                    value={content.hero.ctaText}
                                    onChange={(e) => setContent({ ...content, hero: { ...content.hero, ctaText: e.target.value } })}
                                />
                            </div>
                            <button
                                onClick={() => saveSection('hero', content.hero)}
                                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                            >
                                Save Hero Changes
                            </button>
                        </div>
                    </Tab.Panel>

                    {/* BANNERS PANEL */}
                    <Tab.Panel className="rounded-xl bg-white dark:bg-slate-800 p-6 shadow ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-medium">Promo Banners</h3>
                                <button
                                    onClick={() => {
                                        const newBanner = { image: '', alt: '', caption: '' };
                                        const newBanners = [...content.banners, newBanner];
                                        setContent({ ...content, banners: newBanners });
                                    }}
                                    className="flex items-center gap-1 text-sm bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700"
                                >
                                    <PlusIcon className="w-4 h-4" /> Add Banner
                                </button>
                            </div>

                            {content.banners.map((banner, idx) => (
                                <div key={idx} className="border p-4 rounded bg-slate-50 dark:bg-slate-900 relative group">
                                    <button
                                        onClick={() => {
                                            const newBanners = content.banners.filter((_, i) => i !== idx);
                                            setContent({ ...content, banners: newBanners });
                                        }}
                                        className="absolute top-2 right-2 text-red-500 hover:bg-red-100 p-1 rounded"
                                    >
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold mb-1">Image URL</label>
                                            <input
                                                type="text"
                                                className="w-full p-2 border rounded text-sm dark:bg-slate-800"
                                                placeholder="https://..."
                                                value={banner.image}
                                                onChange={(e) => {
                                                    const newBanners = [...content.banners];
                                                    newBanners[idx].image = e.target.value;
                                                    setContent({ ...content, banners: newBanners });
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold mb-1">Caption</label>
                                            <input
                                                type="text"
                                                className="w-full p-2 border rounded text-sm dark:bg-slate-800"
                                                placeholder="Promo 50%..."
                                                value={banner.caption}
                                                onChange={(e) => {
                                                    const newBanners = [...content.banners];
                                                    newBanners[idx].caption = e.target.value;
                                                    setContent({ ...content, banners: newBanners });
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <button
                                onClick={() => saveSection('banners', content.banners)}
                                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 mt-4"
                            >
                                Save Banners
                            </button>
                        </div>
                    </Tab.Panel>

                    {/* FEATURES PANEL */}
                    <Tab.Panel className="rounded-xl bg-white dark:bg-slate-800 p-6 shadow ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-medium">Features (USP)</h3>
                                <button
                                    onClick={() => {
                                        const newItems = [...content.features, { icon: 'Speed', title: '', description: '' }];
                                        setContent({ ...content, features: newItems });
                                    }}
                                    className="flex items-center gap-1 text-sm bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700"
                                >
                                    <PlusIcon className="w-4 h-4" /> Add Feature
                                </button>
                            </div>
                            {content.features.map((item, idx) => (
                                <div key={idx} className="border p-4 rounded bg-slate-50 dark:bg-slate-900 relative">
                                    <button
                                        onClick={() => {
                                            const newItems = content.features.filter((_, i) => i !== idx);
                                            setContent({ ...content, features: newItems });
                                        }}
                                        className="absolute top-2 right-2 text-red-500 hover:bg-red-100 p-1 rounded"
                                    >
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold mb-1">Icon Key</label>
                                            <select
                                                className="w-full p-2 border rounded text-sm dark:bg-slate-800"
                                                value={item.icon}
                                                onChange={(e) => {
                                                    const newItems = [...content.features];
                                                    newItems[idx].icon = e.target.value;
                                                    setContent({ ...content, features: newItems });
                                                }}
                                            >
                                                <option value="Speed">Speed (Wifi)</option>
                                                <option value="Stable">Stable (Shield)</option>
                                                <option value="Support">Support (Group)</option>

                                                <option value="Flash">Flash (Bolt)</option>
                                                <option value="Secure">Secure (Lock)</option>
                                                <option value="Global">Global (World)</option>
                                                <option value="Device">Device (Mobile)</option>
                                                <option value="Cloud">Cloud</option>
                                                <option value="Time">Time (Clock)</option>
                                                <option value="Price">Price (Rp)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold mb-1">Title</label>
                                            <input
                                                type="text"
                                                className="w-full p-2 border rounded text-sm dark:bg-slate-800"
                                                value={item.title}
                                                onChange={(e) => {
                                                    const newItems = [...content.features];
                                                    newItems[idx].title = e.target.value;
                                                    setContent({ ...content, features: newItems });
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold mb-1">Description</label>
                                            <textarea
                                                className="w-full p-2 border rounded text-sm dark:bg-slate-800"
                                                rows={2}
                                                value={item.description}
                                                onChange={(e) => {
                                                    const newItems = [...content.features];
                                                    newItems[idx].description = e.target.value;
                                                    setContent({ ...content, features: newItems });
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <button
                                onClick={() => saveSection('features', content.features)}
                                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 mt-4"
                            >
                                Save Features
                            </button>
                        </div>
                    </Tab.Panel>


                    {/* PRICING PANEL */}
                    <Tab.Panel className="rounded-xl bg-white dark:bg-slate-800 p-6 shadow ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2">
                        <PricingManager
                            initialSelected={content.pricing?.packageIds || []}
                            initialConfig={content.pricing || {}}
                            onSave={(pricingData) => {
                                // pricingData contains { packageIds: [], packages: {} }
                                const newPricingContent = { ...content.pricing, ...pricingData };
                                setContent({ ...content, pricing: newPricingContent });
                                saveSection('pricing', newPricingContent);
                            }}
                        />
                    </Tab.Panel>

                    {/* TESTIMONIALS PANEL */}
                    <Tab.Panel className="rounded-xl bg-white dark:bg-slate-800 p-6 shadow ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-medium">Testimonials</h3>
                                <button
                                    onClick={() => {
                                        const newItems = [...content.testimonials, { name: '', role: '', text: '', rating: 5 }];
                                        setContent({ ...content, testimonials: newItems });
                                    }}
                                    className="flex items-center gap-1 text-sm bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700"
                                >
                                    <PlusIcon className="w-4 h-4" /> Add Review
                                </button>
                            </div>
                            {content.testimonials.map((item, idx) => (
                                <div key={idx} className="border p-4 rounded bg-slate-50 dark:bg-slate-900 relative">
                                    <button
                                        onClick={() => {
                                            const newItems = content.testimonials.filter((_, i) => i !== idx);
                                            setContent({ ...content, testimonials: newItems });
                                        }}
                                        className="absolute top-2 right-2 text-red-500 hover:bg-red-100 p-1 rounded"
                                    >
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold mb-1">Name</label>
                                            <input
                                                type="text"
                                                className="w-full p-2 border rounded text-sm dark:bg-slate-800"
                                                value={item.name}
                                                onChange={(e) => {
                                                    const newItems = [...content.testimonials];
                                                    newItems[idx].name = e.target.value;
                                                    setContent({ ...content, testimonials: newItems });
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold mb-1">Role</label>
                                            <input
                                                type="text"
                                                className="w-full p-2 border rounded text-sm dark:bg-slate-800"
                                                value={item.role}
                                                onChange={(e) => {
                                                    const newItems = [...content.testimonials];
                                                    newItems[idx].role = e.target.value;
                                                    setContent({ ...content, testimonials: newItems });
                                                }}
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-xs font-bold mb-1">Review</label>
                                            <textarea
                                                className="w-full p-2 border rounded text-sm dark:bg-slate-800"
                                                rows={2}
                                                value={item.text}
                                                onChange={(e) => {
                                                    const newItems = [...content.testimonials];
                                                    newItems[idx].text = e.target.value;
                                                    setContent({ ...content, testimonials: newItems });
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <button
                                onClick={() => saveSection('testimonials', content.testimonials)}
                                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 mt-4"
                            >
                                Save Testimonials
                            </button>
                        </div>
                    </Tab.Panel>

                    {/* FOOTER PANEL */}
                    <Tab.Panel className="rounded-xl bg-white dark:bg-slate-800 p-6 shadow ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2">
                        <div className="space-y-4">
                            <h3 className="text-lg font-medium">Footer Settings</h3>
                            <div>
                                <label className="block text-sm font-medium mb-1">About Text</label>
                                <textarea
                                    className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600"
                                    rows={3}
                                    value={content.footer?.about || ''}
                                    onChange={(e) => setContent({ ...content, footer: { ...content.footer, about: e.target.value } })}
                                    placeholder="Brief description about the company..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Copyright Text</label>
                                <input
                                    type="text"
                                    className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600"
                                    value={content.footer?.copyright || ''}
                                    onChange={(e) => setContent({ ...content, footer: { ...content.footer, copyright: e.target.value } })}
                                    placeholder="e.g. Kita Selalu Terkoneksi"
                                />
                            </div>

                            <h4 className="font-medium pt-2">Social Media Links</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-bold mb-1">Facebook URL</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 border rounded text-sm dark:bg-slate-700"
                                        placeholder="https://facebook.com/..."
                                        value={content.footer?.social?.fb || ''}
                                        onChange={(e) => setContent({
                                            ...content,
                                            footer: {
                                                ...content.footer,
                                                social: { ...content.footer.social, fb: e.target.value }
                                            }
                                        })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold mb-1">Instagram URL</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 border rounded text-sm dark:bg-slate-700"
                                        placeholder="https://instagram.com/..."
                                        value={content.footer?.social?.ig || ''}
                                        onChange={(e) => setContent({
                                            ...content,
                                            footer: {
                                                ...content.footer,
                                                social: { ...content.footer.social, ig: e.target.value }
                                            }
                                        })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold mb-1">WhatsApp Number</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 border rounded text-sm dark:bg-slate-700"
                                        placeholder="628..."
                                        value={content.footer?.social?.wa || ''}
                                        onChange={(e) => setContent({
                                            ...content,
                                            footer: {
                                                ...content.footer,
                                                social: { ...content.footer.social, wa: e.target.value }
                                            }
                                        })}
                                    />
                                </div>
                            </div>

                            <button
                                onClick={() => saveSection('footer', content.footer)}
                                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 mt-4"
                            >
                                Save Footer Settings
                            </button>
                        </div>
                    </Tab.Panel>
                </Tab.Panels>
            </Tab.Group>
        </div>
    );
}

// Icon mapping for selection
const ICONS = ['Gauge', 'Headset', 'Infinity', 'ShieldCheck', 'Trophy', 'Sparkles', 'Zap', 'Star', 'Check', 'Wifi', 'LockClosed', 'Globe', 'DevicePhoneMobile', 'Cloud', 'Clock', 'Banknotes'];

function PricingManager({ initialSelected, initialConfig, onSave }) {
    const [packages, setPackages] = useState([]);
    const [selectedIds, setSelectedIds] = useState(initialSelected || []);
    // Config: { [packageId]: { badge: '', badgeColor: '', highlight: boolean, features: [{ text: '', icon: '' }] } }
    const [config, setConfig] = useState(initialConfig?.packages || {});
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);

    useEffect(() => {
        const fetchPackages = async () => {
            try {
                const res = await api.get('/api/v1/packages?limit=100');
                const data = res.data;
                if (data.success) {
                    setPackages(data.data.packages);
                }
            } catch (e) {
                toast.error("Failed to load packages list");
            } finally {
                setLoading(false);
            }
        };
        fetchPackages();
    }, []);

    const togglePackage = (id) => {
        setSelectedIds(prev => {
            if (prev.includes(id)) return prev.filter(p => p !== id);
            return [...prev, id];
        });
    };

    const updateConfig = (pkgId, field, value) => {
        setConfig(prev => ({
            ...prev,
            [pkgId]: {
                ...prev[pkgId],
                [field]: value
            }
        }));
    };

    const addFeature = (pkgId) => {
        const currentFeatures = config[pkgId]?.features || [];
        updateConfig(pkgId, 'features', [...currentFeatures, { text: '', icon: 'Check' }]);
    };

    const updateFeature = (pkgId, idx, field, value) => {
        const currentFeatures = [...(config[pkgId]?.features || [])];
        currentFeatures[idx] = { ...currentFeatures[idx], [field]: value };
        updateConfig(pkgId, 'features', currentFeatures);
    };

    const removeFeature = (pkgId, idx) => {
        const currentFeatures = [...(config[pkgId]?.features || [])];
        currentFeatures.splice(idx, 1);
        updateConfig(pkgId, 'features', currentFeatures);
    };

    const handleSave = () => {
        // We save both the list of selected IDs and the full config map
        onSave({ packageIds: selectedIds, packages: config });
    };

    if (loading) return <div>Loading packages...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Pricing Configuration</h3>
                <span className="text-sm text-slate-500">{selectedIds.length} Packages Selected</span>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {packages.map(pkg => {
                    const isSelected = selectedIds.includes(pkg.id);
                    const pkgConfig = config[pkg.id] || {};

                    return (
                        <div key={pkg.id} className={`border rounded-lg p-4 transition-all ${isSelected ? 'border-blue-500 bg-blue-50/10' : 'border-slate-200 opacity-70'}`}>
                            {/* Header / Selection */}
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => togglePackage(pkg.id)}
                                        className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <div>
                                        <h4 className="font-bold text-lg">{pkg.name}</h4>
                                        <p className="text-sm text-slate-500">
                                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(pkg.price)} - {pkg.speed}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setEditingId(editingId === pkg.id ? null : pkg.id)}
                                    disabled={!isSelected}
                                    className={`text-sm px-3 py-1 rounded ${editingId === pkg.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'} ${!isSelected && 'opacity-50 cursor-not-allowed'}`}
                                >
                                    {editingId === pkg.id ? 'Close Config' : 'Configure Visuals'}
                                </button>
                            </div>

                            {/* Configuration Panel */}
                            {isSelected && editingId === pkg.id && (
                                <div className="mt-4 pl-8 border-l-2 border-blue-200 space-y-4 animate-fadeIn">
                                    <div className="flex justify-end">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-slate-500">Copy from:</span>
                                            <select
                                                className="text-xs border rounded p-1 dark:bg-slate-800"
                                                onChange={(e) => {
                                                    const sourceId = parseInt(e.target.value);
                                                    if (sourceId && config[sourceId]) {
                                                        const sourceConfig = config[sourceId];
                                                        updateConfig(pkg.id, 'badge', sourceConfig.badge);
                                                        updateConfig(pkg.id, 'badgeColor', sourceConfig.badgeColor);
                                                        updateConfig(pkg.id, 'features', sourceConfig.features);
                                                        toast.success(`Copied settings from package #${sourceId}`);
                                                    }
                                                }}
                                                defaultValue=""
                                            >
                                                <option value="" disabled>Select Package</option>
                                                {selectedIds.filter(id => id !== pkg.id).map(id => {
                                                    const p = packages.find(x => x.id === id);
                                                    return <option key={id} value={id}>{p?.name}</option>
                                                })}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold mb-1">Badge Text (Optional)</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. Best Seller"
                                                className="w-full p-2 border rounded text-sm dark:bg-slate-800"
                                                value={pkgConfig.badge || ''}
                                                onChange={(e) => updateConfig(pkg.id, 'badge', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold mb-1">Badge Color</label>
                                            <select
                                                className="w-full p-2 border rounded text-sm dark:bg-slate-800"
                                                value={pkgConfig.badgeColor || 'bg-blue-600 text-white'}
                                                onChange={(e) => updateConfig(pkg.id, 'badgeColor', e.target.value)}
                                            >
                                                <option value="bg-blue-600 text-white">Blue</option>
                                                <option value="bg-slate-800 text-white">Dark</option>
                                                <option value="bg-red-600 text-white">Red</option>
                                                <option value="bg-green-600 text-white">Green</option>
                                                <option value="bg-yellow-500 text-white">Gold</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Features List */}
                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="block text-xs font-bold">Features List</label>
                                            <button onClick={() => addFeature(pkg.id)} className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded hover:bg-green-100">+ Add Feature</button>
                                        </div>
                                        <div className="space-y-2">
                                            {(pkgConfig.features || []).map((feat, idx) => (
                                                <div key={idx} className="flex gap-2 items-center">
                                                    <select
                                                        className="w-32 p-2 border rounded text-sm dark:bg-slate-800"
                                                        value={feat.icon}
                                                        onChange={(e) => updateFeature(pkg.id, idx, 'icon', e.target.value)}
                                                    >
                                                        {ICONS.map(i => <option key={i} value={i}>{i}</option>)}
                                                    </select>
                                                    <input
                                                        type="text"
                                                        placeholder="Feature text..."
                                                        className="flex-1 p-2 border rounded text-sm dark:bg-slate-800"
                                                        value={feat.text}
                                                        onChange={(e) => updateFeature(pkg.id, idx, 'text', e.target.value)}
                                                    />
                                                    <button onClick={() => removeFeature(pkg.id, idx)} className="text-red-400 hover:text-red-600">
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                            {(pkgConfig.features || []).length === 0 && (
                                                <p className="text-xs text-slate-400 italic">No custom features added. Will fallback to package description.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <button
                onClick={handleSave}
                className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 w-full shadow-lg shadow-blue-500/20"
            >
                Save Pricing Configuration
            </button>
        </div>
    );
}

// CheckIcon component for internal usage if not imported
function CheckIcon(props) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
    )
}
