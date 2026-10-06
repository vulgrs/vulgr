import React, { useState, useEffect, useMemo } from 'react';
import {
  Zap,
  Search,
  Brain,
  Plus,
  Play,
  Copy,
  Terminal,
  Check,
  Trash2,
  Tag,
  Sliders,
  Code2,
  Sparkles,
  Layers,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog.js';
import type { SharedSkill, SkillCategory, MemoryData } from '../types/warp.js';
import { useI18n } from '../i18n/index.js';

interface SkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunInTerminal: (command: string) => void;
  onInsertIntoInput: (command: string) => void;
}

export const SkillsModal: React.FC<SkillsModalProps> = ({
  isOpen,
  onClose,
  onRunInTerminal,
  onInsertIntoInput,
}) => {
  const { t } = useI18n();
  const k = t.skills;
  const [activeTab, setActiveTab] = useState<'skills' | 'memory' | 'create'>('skills');
  const [skills, setSkills] = useState<SharedSkill[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  // Memory state
  const [memoryData, setMemoryData] = useState<MemoryData | null>(null);
  const [memoryPromptSnippet, setMemoryPromptSnippet] = useState('');
  const [newFactKey, setNewFactKey] = useState('');
  const [newFactVal, setNewFactVal] = useState('');
  const [newRule, setNewRule] = useState('');

  // Create skill form state
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState<SkillCategory>('custom');
  const [newSkillDesc, setNewSkillDesc] = useState('');
  const [newSkillTemplate, setNewSkillTemplate] = useState('');
  const [newSkillTags, setNewSkillTags] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    loadSkills();
    loadMemory();
  }, [isOpen]);

  const loadSkills = async () => {
    if (window.warpApi?.listSkills) {
      try {
        const list = await window.warpApi.listSkills();
        setSkills(list);
        if (list.length > 0 && !selectedSkillId) {
          setSelectedSkillId(list[0].id);
        }
      } catch (err) {
        console.error('Failed to load skills:', err);
      }
    }
  };

  const loadMemory = async () => {
    if (window.warpApi?.getMemory) {
      try {
        const data = await window.warpApi.getMemory();
        setMemoryData(data);
      } catch {}
    }
    if (window.warpApi?.getMemorySnippet) {
      try {
        const snippet = await window.warpApi.getMemorySnippet();
        setMemoryPromptSnippet(snippet);
      } catch {}
    }
  };

  const filteredSkills = useMemo(() => {
    return skills.filter((s) => {
      if (selectedCategory !== 'all' && s.category !== selectedCategory) return false;
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        return (
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.commandTemplate.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [skills, selectedCategory, searchQuery]);

  const selectedSkill = useMemo(() => {
    return skills.find((s) => s.id === selectedSkillId) || filteredSkills[0] || null;
  }, [skills, selectedSkillId, filteredSkills]);

  // When selected skill changes, initialize parameter defaults
  useEffect(() => {
    if (!selectedSkill) return;
    const initial: Record<string, string> = {};
    for (const p of selectedSkill.parameters) {
      initial[p.name] = p.defaultValue || '';
    }
    setParamValues(initial);
  }, [selectedSkill?.id]);

  // Render preview command
  const renderedCommand = useMemo(() => {
    if (!selectedSkill) return '';
    let cmd = selectedSkill.commandTemplate;
    for (const [key, val] of Object.entries(paramValues)) {
      const displayVal = val.trim().length > 0 ? val.trim() : (selectedSkill.parameters.find(p => p.name === key)?.defaultValue || `{{${key}}}`);
      cmd = cmd.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), displayVal);
    }
    return cmd;
  }, [selectedSkill, paramValues]);

  const handleCopy = () => {
    navigator.clipboard.writeText(renderedCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRun = () => {
    if (!renderedCommand) return;
    onRunInTerminal(renderedCommand);
    onClose();
  };

  const handleInsert = () => {
    if (!renderedCommand) return;
    onInsertIntoInput(renderedCommand);
    onClose();
  };

  const handleSaveCustomSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillName.trim() || !newSkillTemplate.trim()) return;

    // Parse placeholders
    const matches = Array.from(newSkillTemplate.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g));
    const paramNames = Array.from(new Set(matches.map((m) => m[1])));
    const parameters = paramNames.map((name) => ({
      name,
      label: name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' '),
      description: k.paramDescription(name),
      defaultValue: '',
    }));

    const skill = {
      id: `custom:${Date.now()}`,
      name: newSkillName.trim(),
      category: newSkillCategory,
      description: newSkillDesc.trim() || k.customSkill,
      commandTemplate: newSkillTemplate.trim(),
      parameters,
      tags: newSkillTags.split(',').map((t) => t.trim()).filter(Boolean),
    };

    if (window.warpApi?.saveSkill) {
      await window.warpApi.saveSkill(skill);
      await loadSkills();
      setSelectedSkillId(skill.id);
      setActiveTab('skills');
      // Reset form
      setNewSkillName('');
      setNewSkillTemplate('');
      setNewSkillDesc('');
      setNewSkillTags('');
    }
  };

  const handleDeleteSkill = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.warpApi?.deleteSkill) {
      await window.warpApi.deleteSkill(id);
      await loadSkills();
    }
  };

  const handleAddFact = async () => {
    if (!newFactKey.trim() || !newFactVal.trim()) return;
    if (window.warpApi?.setMemoryFact) {
      await window.warpApi.setMemoryFact(newFactKey, newFactVal, 'user');
      setNewFactKey('');
      setNewFactVal('');
      await loadMemory();
    }
  };

  const handleDeleteFact = async (key: string) => {
    if (window.warpApi?.deleteMemoryFact) {
      await window.warpApi.deleteMemoryFact(key);
      await loadMemory();
    }
  };

  const handleAddRule = async () => {
    if (!newRule.trim()) return;
    if (window.warpApi?.addMemoryRule) {
      await window.warpApi.addMemoryRule(newRule);
      setNewRule('');
      await loadMemory();
    }
  };

  const handleRemoveRule = async (rule: string) => {
    if (window.warpApi?.removeMemoryRule) {
      await window.warpApi.removeMemoryRule(rule);
      await loadMemory();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <div className="flex items-center justify-between border-b bg-muted/40 px-6 py-4 pr-14">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-400 via-orange-500 to-zinc-500 flex items-center justify-center text-black font-bold shadow-[0_0_15px_rgba(245,158,11,0.3)]">
              <Zap size={18} className="fill-current" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <DialogTitle>{k.title}</DialogTitle>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-500/15 text-zinc-300 border border-zinc-500/30">
                  {k.badge}
                </span>
              </div>
              <DialogDescription>
                {k.description}
              </DialogDescription>
            </div>
          </div>

          {/* Navigation Tabs & Close */}
          <div className="flex items-center space-x-2">
            <div className="flex items-center bg-zinc-900 p-1 rounded-xl border border-zinc-800">
              <button
                onClick={() => setActiveTab('skills')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
 activeTab === 'skills'
 ? 'bg-zinc-500 text-black shadow-sm font-semibold'
 : 'text-zinc-400 hover:text-zinc-100'
 }`}
              >
                <Zap size={13} />
                <span>{k.tabSkills}</span>
              </button>

              <button
                onClick={() => setActiveTab('memory')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
 activeTab === 'memory'
 ? 'bg-zinc-500 text-zinc-100 shadow-sm font-semibold'
 : 'text-zinc-400 hover:text-zinc-100'
 }`}
              >
                <Brain size={13} />
                <span>{k.tabMemory}</span>
              </button>

              <button
                onClick={() => setActiveTab('create')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
 activeTab === 'create'
 ? 'bg-emerald-500 text-black shadow-sm font-semibold'
 : 'text-zinc-400 hover:text-zinc-100'
 }`}
              >
                <Plus size={13} />
                <span>{k.tabCreate}</span>
              </button>
            </div>

          </div>
        </div>

        {/* Tab 1: Shared Skills Explorer */}
        {activeTab === 'skills' && (
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Search & Category Filter Strip */}
            <div className="px-6 py-3 border-b border-zinc-900 flex items-center justify-between space-x-4 bg-base-surface">
              <div className="relative flex-1 max-w-md">
                <Search size={14} className="absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder={k.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 bg-black/40 border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500/60 font-mono transition-all"
                  autoFocus
                />
              </div>

              <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar">
                {['all', 'git', 'docker', 'node', 'system', 'ai', 'custom'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono capitalize transition-all ${
 selectedCategory === cat
 ? 'bg-white/[0.12] text-zinc-100 font-medium border border-white/[0.2]'
 : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
 }`}
                  >
                    {k.categories[cat] ?? cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Split View: Left List / Right Inspector */}
            <div className="flex-1 min-h-0 flex divide-x divide-white/[0.06]">
              {/* Left Skills List */}
              <div className="w-80 overflow-y-auto p-3 space-y-1.5 bg-black/20">
                {filteredSkills.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-500 font-mono">
                    {k.noMatches}
                  </div>
                ) : (
                  filteredSkills.map((skill) => {
                    const isSelected = selectedSkill?.id === skill.id;
                    return (
                      <div
                        key={skill.id}
                        onClick={() => setSelectedSkillId(skill.id)}
                        className={`group p-3 rounded-xl cursor-pointer border transition-all ${
 isSelected
 ? 'bg-zinc-500/10 border-zinc-500/40 shadow-sm'
 : 'bg-base-surface border-white/[0.05] hover:bg-zinc-900 hover:border-zinc-800'
 }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className={`text-xs font-semibold truncate ${
 isSelected ? 'text-zinc-300' : 'text-zinc-200 group-hover:text-zinc-100'
 }`}
                          >
                            {skill.name}
                          </span>
                          <div className="flex items-center space-x-1.5">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-zinc-900 text-zinc-400">
                              {skill.category}
                            </span>
                            {skill.isCustom && (
                              <button
                                onClick={(e) => handleDeleteSkill(skill.id, e)}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-red-400 transition-opacity"
                                title={k.deleteSkill}
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                          {skill.description}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Right Inspector & Parametric Form */}
              <div className="flex-1 overflow-y-auto p-6 flex flex-col justify-between space-y-6">
                {selectedSkill ? (
                  <div className="space-y-6">
                    {/* Header */}
                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-500/15 text-zinc-300 border border-zinc-500/30">
                          {selectedSkill.category.toUpperCase()}
                        </span>
                        <h3 className="text-base font-bold text-zinc-100 tracking-wide">
                          {selectedSkill.name}
                        </h3>
                      </div>
                      <p className="text-xs text-zinc-400">{selectedSkill.description}</p>
                    </div>

                    {/* Parameters Form */}
                    {selectedSkill.parameters.length > 0 && (
                      <div className="space-y-3 bg-base-surface p-4 rounded-xl border border-zinc-900">
                        <div className="flex items-center space-x-1.5 text-xs font-semibold text-zinc-300">
                          <Sliders size={13} className="text-zinc-400" />
                          <span>{k.parameters}</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {selectedSkill.parameters.map((param) => (
                            <div key={param.name} className="space-y-1">
                              <label className="text-[11px] font-mono text-zinc-400 flex items-center justify-between">
                                <span>{param.label || param.name}</span>
                                <span className="text-[9px] text-zinc-400/80">`{`{{${param.name}}}`}`</span>
                              </label>

                              {param.options && param.options.length > 0 ? (
                                <select
                                  value={paramValues[param.name] || ''}
                                  onChange={(e) =>
                                    setParamValues((prev) => ({ ...prev, [param.name]: e.target.value }))
                                  }
                                  className="w-full px-3 py-1.5 bg-black/40 border border-zinc-800 rounded-lg text-xs text-zinc-100 font-mono focus:outline-none focus:border-zinc-500/60"
                                >
                                  {param.options.map((opt) => (
                                    <option key={opt} value={opt} className="bg-zinc-900 text-zinc-100">
                                      {opt}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  placeholder={param.defaultValue || k.enterParam(param.name)}
                                  value={paramValues[param.name] || ''}
                                  onChange={(e) =>
                                    setParamValues((prev) => ({ ...prev, [param.name]: e.target.value }))
                                  }
                                  className="w-full px-3 py-1.5 bg-black/40 border border-zinc-800 rounded-lg text-xs text-zinc-100 font-mono focus:outline-none focus:border-zinc-500/60"
                                />
                              )}
                              {param.description && (
                                <p className="text-[10px] text-zinc-500">{param.description}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Live Rendered Command Preview */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-zinc-400">
                        <span className="font-mono text-[11px] flex items-center space-x-1.5">
                          <Code2 size={13} className="text-zinc-400" />
                          <span>{k.preview}</span>
                        </span>
                        <span className="text-[10px] text-zinc-500">{k.liveUpdated}</span>
                      </div>

                      <div className="relative p-4 rounded-xl bg-black/60 border border-zinc-500/30 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)] font-mono text-xs text-zinc-300 break-all leading-relaxed">
                        <span className="text-zinc-500 select-none mr-2">$</span>
                        {renderedCommand}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs text-zinc-500 font-mono">
                    {k.selectSkill}
                  </div>
                )}

                {/* Bottom Action Buttons */}
                {selectedSkill && (
                  <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleCopy}
                        className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-white/[0.1] text-xs font-medium text-zinc-200 border border-zinc-800 transition-all"
                      >
                        {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                        <span>{copied ? k.copied : k.copy}</span>
                      </button>

                      <button
                        onClick={handleInsert}
                        className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-white/[0.1] text-xs font-medium text-zinc-200 border border-zinc-800 transition-all"
                      >
                        <Terminal size={13} />
                        <span>{k.insertIntoDock}</span>
                      </button>
                    </div>

                    <button
                      onClick={handleRun}
                      className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-zinc-500 to-zinc-600 hover:from-zinc-400 hover:to-zinc-500 text-black font-semibold text-xs shadow-[0_0_20px_rgba(0,216,255,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <Play size={13} className="fill-current" />
                      <span>{k.runInTerminal}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Workspace Memory Store */}
        {activeTab === 'memory' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-zinc-100 flex items-center space-x-2">
                  <Brain size={16} className="text-zinc-400" />
                  <span>{k.memoryTitle}</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {k.memorySavedIn} <code className="text-zinc-300">.warp-memory.json</code>. {k.memoryInjected}
                </p>
              </div>

              <div className="px-2.5 py-1 rounded-lg bg-zinc-500/10 border border-zinc-500/30 text-zinc-300 text-[11px] font-mono">
                {k.memoryCounts(Object.keys(memoryData?.facts || {}).length, memoryData?.rules.length || 0)}
              </div>
            </div>

            {/* Facts Grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
                <span>{k.factsTitle}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {memoryData &&
                  Object.values(memoryData.facts).map((fact) => (
                    <div
                      key={fact.key}
                      className="p-2.5 rounded-xl bg-base-surface border border-zinc-900 flex items-center justify-between text-xs font-mono"
                    >
                      <div>
                        <span className="text-zinc-300 font-semibold">{fact.key}: </span>
                        <span className="text-zinc-300">{fact.value}</span>
                        <span className="ml-2 text-[10px] text-zinc-500">({fact.source})</span>
                      </div>
                      <button
                        onClick={() => handleDeleteFact(fact.key)}
                        className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
              </div>

              {/* Add Fact Row */}
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="text"
                  placeholder={k.factKey}
                  value={newFactKey}
                  onChange={(e) => setNewFactKey(e.target.value)}
                  className="w-1/3 px-3 py-1.5 bg-black/40 border border-zinc-800 rounded-lg text-xs text-zinc-100 font-mono focus:outline-none focus:border-zinc-500/60"
                />
                <input
                  type="text"
                  placeholder={k.factValue}
                  value={newFactVal}
                  onChange={(e) => setNewFactVal(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-black/40 border border-zinc-800 rounded-lg text-xs text-zinc-100 font-mono focus:outline-none focus:border-zinc-500/60"
                />
                <button
                  onClick={handleAddFact}
                  className="px-3 py-1.5 rounded-lg bg-zinc-600 hover:bg-zinc-500 text-zinc-100 text-xs font-semibold transition-all"
                >
                  {k.addFact}
                </button>
              </div>
            </div>

            {/* Learned Rules */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
                <span>{k.rulesTitle}</span>
              </div>

              <div className="space-y-1.5">
                {memoryData?.rules.map((rule) => (
                  <div
                    key={rule}
                    className="p-2.5 rounded-xl bg-base-surface border border-zinc-900 flex items-center justify-between text-xs"
                  >
                    <span className="text-zinc-300 font-mono">{rule}</span>
                    <button
                      onClick={() => handleRemoveRule(rule)}
                      className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add Rule Row */}
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="text"
                  placeholder={k.rulePlaceholder}
                  value={newRule}
                  onChange={(e) => setNewRule(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-black/40 border border-zinc-800 rounded-lg text-xs text-zinc-100 font-mono focus:outline-none focus:border-zinc-500/60"
                />
                <button
                  onClick={handleAddRule}
                  className="px-3 py-1.5 rounded-lg bg-zinc-600 hover:bg-zinc-500 text-zinc-100 text-xs font-semibold transition-all"
                >
                  {k.addRule}
                </button>
              </div>
            </div>

            {/* Prompt Preview Snippet */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-zinc-400 flex items-center space-x-1.5">
                <Sparkles size={13} className="text-amber-400" />
                <span>{k.snippetTitle}</span>
              </div>
              <pre className="p-3 bg-black/60 border border-zinc-500/30 rounded-xl text-xs font-mono text-zinc-200 whitespace-pre-wrap">
                {memoryPromptSnippet || k.snippetLoading}
              </pre>
            </div>
          </div>
        )}

        {/* Tab 3: Create Custom Skill Form */}
        {activeTab === 'create' && (
          <form onSubmit={handleSaveCustomSkill} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-zinc-100 flex items-center space-x-2">
                <Plus size={16} className="text-emerald-400" />
                <span>{k.createTitle}</span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                {k.createHintBefore} <code className="text-zinc-300">{'{{variable_name}}'}</code> {k.createHintAfter}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-300">{k.skillName}</label>
                <input
                  type="text"
                  required
                  placeholder={k.skillNamePlaceholder}
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                  className="w-full px-3 py-2 bg-black/40 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-300">{k.category}</label>
                <select
                  value={newSkillCategory}
                  onChange={(e) => setNewSkillCategory(e.target.value as SkillCategory)}
                  className="w-full px-3 py-2 bg-black/40 border border-zinc-800 rounded-xl text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500/60"
                >
                  <option value="git">{k.categoryOptions.git}</option>
                  <option value="docker">{k.categoryOptions.docker}</option>
                  <option value="node">{k.categoryOptions.node}</option>
                  <option value="system">{k.categoryOptions.system}</option>
                  <option value="ai">{k.categoryOptions.ai}</option>
                  <option value="custom">{k.categoryOptions.custom}</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-300">{k.skillDescription}</label>
              <input
                type="text"
                placeholder={k.skillDescriptionPlaceholder}
                value={newSkillDesc}
                onChange={(e) => setNewSkillDesc(e.target.value)}
                className="w-full px-3 py-2 bg-black/40 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/60"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span>{k.template}</span>
                <span className="text-[10px] text-zinc-400 font-mono">{'e.g. kubectl apply -f ./k8s/{{environment}}.yaml'}</span>
              </label>
              <textarea
                required
                rows={3}
                placeholder="docker run -d -p {{port}}:{{port}} --name {{name}} {{image}}"
                value={newSkillTemplate}
                onChange={(e) => setNewSkillTemplate(e.target.value)}
                className="w-full px-3 py-2 bg-black/40 border border-zinc-800 rounded-xl text-xs text-zinc-300 font-mono focus:outline-none focus:border-emerald-500/60"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-300">{k.tags}</label>
              <input
                type="text"
                placeholder="k8s, deploy, prod"
                value={newSkillTags}
                onChange={(e) => setNewSkillTags(e.target.value)}
                className="w-full px-3 py-2 bg-black/40 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/60"
              />
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs shadow-[0_0_15px_rgba(34,197,94,0.3)] transition-all"
              >
                {k.saveSkill}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
