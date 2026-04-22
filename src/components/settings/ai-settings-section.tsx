
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  ShieldAlert,
  Cpu,
  RefreshCw,
  Server,
  ArrowLeft,
  Loader2,
  Check,
  AlertCircle,
  Zap,
  Save,
  RotateCcw,
  Flame,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUser } from '@/hooks/use-user';
import { discoverModels, getAiConfig, saveAiConfig, resetAiConfig } from '@/lib/ai-client';
import type { DiscoveredModel, DiscoveryResult } from '@/lib/ai-client';

const MAX_WARMUP_RETRIES = 30;   // ECONNRESET: model loading → 30 × 5s = 2.5 min
const MAX_CONN_RETRIES = 3;      // ECONNREFUSED: nothing listening → 3 × 5s = 15s then hard error
const RETRY_INTERVAL = 5000;

export function AiSettingsSection() {
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Editable config fields
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [activeModel, setActiveModel] = useState('');
  const [selectedModel, setSelectedModel] = useState('');

  // Env defaults (for display / reset)
  const [envEndpoint, setEnvEndpoint] = useState('');
  const [envApiKey, setEnvApiKey] = useState('');
  const [envModel, setEnvModel] = useState('');

  // Track if config is dirty
  const [savedEndpoint, setSavedEndpoint] = useState('');
  const [savedApiKey, setSavedApiKey] = useState('');

  // Discovery state
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);

  // Retry state
  const [retryKind, setRetryKind] = useState<'warming_up' | 'connection_down' | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    loadConfig();
    return () => {
      // Cleanup retry timer on unmount
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      abortRef.current = true;
    };
  }, []);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const config = await getAiConfig();
      setEndpoint(config.endpoint);
      setSavedEndpoint(config.endpoint);
      setApiKey(config.apiKey);
      setSavedApiKey(config.apiKey);
      setActiveModel(config.activeModel);
      setSelectedModel(config.activeModel);
      setEnvEndpoint(config.envEndpoint);
      setEnvApiKey(config.envApiKey);
      setEnvModel(config.envModel);
    } catch (err) {
      console.error('Failed to load AI config:', err);
    }
    setIsLoading(false);
  };

  const configIsDirty = endpoint !== savedEndpoint || apiKey !== savedApiKey;

  // ---- Save endpoint / API key ----
  const handleSaveConfig = async () => {
    setIsSaving(true);
    const result = await saveAiConfig({ endpoint, apiKey });
    if (result.success) {
      setSavedEndpoint(endpoint);
      setSavedApiKey(apiKey);
      toast({ title: "Configuration Saved", description: "Endpoint and API key updated." });
      // Clear discovered models since endpoint changed
      setDiscoveredModels([]);
      setDiscoveryError(null);
    } else {
      toast({ variant: "destructive", title: "Save Failed", description: result.error });
    }
    setIsSaving(false);
  };

  // ---- Discover with auto-retry ----
  const runDiscovery = useCallback(async (attempt: number = 0): Promise<void> => {
    if (abortRef.current) return;
    setIsDiscovering(true);
    setDiscoveryError(null);

    const result: DiscoveryResult = await discoverModels(endpoint);

    if (abortRef.current) return;

    if (result.models.length > 0) {
      // Success!
      setDiscoveredModels(result.models);
      setRetryKind(null);
      setRetryCount(0);
      setIsDiscovering(false);
      toast({
        title: "Models Discovered",
        description: `Found ${result.models.length} model(s) on ${result.endpoint}.`,
      });
      // Auto-select first if current not in list
      if (!result.models.find(m => m.id === selectedModel) && result.models.length > 0) {
        setSelectedModel(result.models[0].id);
      }
      return;
    }

    // Determine retry limit based on error kind
    const maxRetries = result.retryKind === 'warming_up' ? MAX_WARMUP_RETRIES : MAX_CONN_RETRIES;

    if (result.retryKind && attempt < maxRetries) {
      setRetryKind(result.retryKind);
      setRetryCount(attempt + 1);
      setDiscoveryError(result.error || 'Connecting...');
      setIsDiscovering(false);
      retryTimerRef.current = setTimeout(() => {
        runDiscovery(attempt + 1);
      }, RETRY_INTERVAL);
      return;
    }

    // Final failure — exhausted retries or non-retryable error
    setDiscoveryError(result.error || 'Discovery failed.');
    setRetryKind(null);
    setRetryCount(0);
    setIsDiscovering(false);
  }, [endpoint, selectedModel, toast]);

  const handleDiscover = () => {
    abortRef.current = false;
    setRetryCount(0);
    setRetryKind(null);
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    runDiscovery(0);
  };

  const handleCancelRetry = () => {
    abortRef.current = true;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setRetryKind(null);
    setIsDiscovering(false);
    setRetryCount(0);
  };

  // ---- Apply selected model ----
  const handleApplyModel = async () => {
    if (!selectedModel) return;
    setIsSaving(true);
    const result = await saveAiConfig({ model: selectedModel });
    if (result.success) {
      setActiveModel(selectedModel);
      toast({ title: "Model Updated", description: `Active model set to "${selectedModel}".` });
    } else {
      toast({ variant: "destructive", title: "Save Failed", description: result.error });
    }
    setIsSaving(false);
  };

  // ---- Reset all to env defaults ----
  const handleResetAll = async () => {
    setIsSaving(true);
    const result = await resetAiConfig();
    if (result.success) {
      setEndpoint(envEndpoint);
      setSavedEndpoint(envEndpoint);
      setApiKey(envApiKey);
      setSavedApiKey(envApiKey);
      setActiveModel(envModel);
      setSelectedModel(envModel);
      setDiscoveredModels([]);
      setDiscoveryError(null);
      toast({ title: "Reset Complete", description: "All settings restored to environment defaults." });
    } else {
      toast({ variant: "destructive", title: "Reset Failed", description: result.error });
    }
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const maxRetries = retryKind === 'warming_up' ? MAX_WARMUP_RETRIES : MAX_CONN_RETRIES;
  const retryProgress = Math.min((retryCount / maxRetries) * 100, 100);
  const isRetrying = retryKind !== null;

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Server className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-xl tracking-normal">Connection</CardTitle>
          </div>
          <CardDescription>
            Point to any OpenAI-compatible server (vLLM, Ollama, llama.cpp, LiteLLM).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="endpoint-input">Endpoint URL</Label>
            <Input
              id="endpoint-input"
              className="font-mono mt-1"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="http://localhost:11434/v1"
            />
            {endpoint !== envEndpoint && (
              <p className="text-xs text-muted-foreground mt-1">
                Env default: <span className="font-mono">{envEndpoint}</span>
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="apikey-input">API Key</Label>
            <Input
              id="apikey-input"
              className="font-mono mt-1"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="not-needed"
            />
            {apiKey !== envApiKey && (
              <p className="text-xs text-muted-foreground mt-1">
                Env default: <span className="font-mono">{envApiKey === 'not-needed' ? '(none)' : '••••••'}</span>
              </p>
            )}
          </div>
        </CardContent>
        <CardFooter className="border-t pt-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            {configIsDirty && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                Unsaved Changes
              </Badge>
            )}
          </div>
          <Button
            onClick={handleSaveConfig}
            disabled={!configIsDirty || isSaving}
          >
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Connection
          </Button>
        </CardFooter>
      </Card>

      {/* ---- Active Model ---- */}
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Zap className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-xl tracking-normal">Active Model</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge variant="default" className="text-sm font-mono px-3 py-1">
              <Zap className="h-3 w-3 mr-1" />
              {activeModel}
            </Badge>
            {activeModel !== envModel && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                Override
              </Badge>
            )}
          </div>
          {activeModel !== envModel && (
            <p className="text-xs text-muted-foreground mt-2">
              Env default: <span className="font-mono">{envModel}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* ---- Model Discovery & Selection ---- */}
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <RefreshCw className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-xl tracking-normal">Model Discovery</CardTitle>
            </div>
            {!isRetrying ? (
              <Button
                variant="outline"
                onClick={handleDiscover}
                disabled={isDiscovering || configIsDirty}
                id="discover-models-btn"
              >
                {isDiscovering ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {isDiscovering ? 'Scanning...' : 'Discover Models'}
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancelRetry}
              >
                Cancel
              </Button>
            )}
          </div>
          <CardDescription>
            {configIsDirty
              ? 'Save your connection settings first, then discover models.'
              : 'Query the inference server to see which models are available.'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Warming up — model is loading (ECONNRESET) */}
          {retryKind === 'warming_up' && (
            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-3">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <Flame className="h-5 w-5 animate-pulse" />
                <span className="font-semibold">Model Loading</span>
              </div>
              <p className="text-sm text-amber-600 dark:text-amber-300">
                {discoveryError}
              </p>
              <div className="space-y-1">
                <Progress value={retryProgress} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Retry {retryCount}/{MAX_WARMUP_RETRIES} — checking every {RETRY_INTERVAL / 1000}s
                </p>
              </div>
            </div>
          )}

          {/* Connection down — nothing listening (ECONNREFUSED) */}
          {retryKind === 'connection_down' && (
            <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-300 dark:border-orange-800 space-y-3">
              <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                <AlertCircle className="h-5 w-5" />
                <span className="font-semibold">Connection Failed</span>
              </div>
              <p className="text-sm text-orange-600 dark:text-orange-300">
                {discoveryError}
              </p>
              <div className="space-y-1">
                <Progress value={retryProgress} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Quick check {retryCount}/{MAX_CONN_RETRIES} — will stop and show error if still unreachable
                </p>
              </div>
            </div>
          )}

          {/* Hard error (non-retryable or retries exhausted) */}
          {discoveryError && !isRetrying && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{discoveryError}</p>
            </div>
          )}

          {/* Model selection dropdown */}
          {discoveredModels.length > 0 && (
            <div className="space-y-3">
              <Label htmlFor="model-select">Available Models ({discoveredModels.length})</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger id="model-select" className="w-full font-mono">
                  <SelectValue placeholder="Select a model..." />
                </SelectTrigger>
                <SelectContent>
                  {discoveredModels.map((model) => (
                    <SelectItem key={model.id} value={model.id} className="font-mono">
                      <div className="flex items-center justify-between w-full gap-4">
                        <span>{model.id}</span>
                        {model.contextLength && (
                          <span className="text-xs text-muted-foreground">
                            {Math.round(model.contextLength / 1024)}K ctx
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedModel && selectedModel !== activeModel && (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <AlertCircle className="h-4 w-4" />
                  <span>
                    Unsaved: <span className="font-mono font-semibold">{activeModel}</span> →{' '}
                    <span className="font-mono font-semibold">{selectedModel}</span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {discoveredModels.length === 0 && !discoveryError && !isRetrying && (
            <div className="text-center py-6 text-muted-foreground">
              <Server className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Click &quot;Discover Models&quot; to scan the inference server.</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="border-t pt-4 flex justify-between items-center">
          <Button
            variant="ghost"
            onClick={handleResetAll}
            disabled={isSaving}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset All to Env Defaults
          </Button>
          <Button
            onClick={handleApplyModel}
            disabled={!selectedModel || selectedModel === activeModel || isSaving}
            id="apply-model-btn"
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            {isSaving ? 'Applying...' : 'Apply Model'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
