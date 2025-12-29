/**
 * Component Playground
 *
 * Interactive component preview system with:
 * - Props control panel for live manipulation
 * - Code snippet generation
 * - Dark mode toggle
 * - Responsive breakpoint visualization
 */

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Copy, Check, Moon, Sun, Smartphone, Tablet, Monitor } from 'lucide-react';

interface ComponentPlaygroundProps {
  component: React.ComponentType<any>;
  componentName: string;
  defaultProps?: Record<string, any>;
  propSchema?: PropSchema[];
}

interface PropSchema {
  name: string;
  type: 'boolean' | 'string' | 'number' | 'select' | 'color';
  default?: any;
  options?: string[];
  description?: string;
}

interface PreviewState {
  props: Record<string, any>;
  darkMode: boolean;
  viewport: 'mobile' | 'tablet' | 'desktop';
}

const viewportSizes = {
  mobile: 'w-full max-w-[375px]',
  tablet: 'w-full max-w-[768px]',
  desktop: 'w-full max-w-full',
};

export function ComponentPlayground({
  component: Component,
  componentName,
  defaultProps = {},
  propSchema = [],
}: ComponentPlaygroundProps) {
  const [state, setState] = useState<PreviewState>({
    props: { ...defaultProps },
    darkMode: false,
    viewport: 'desktop',
  });
  const [copied, setCopied] = useState(false);

  // Update prop value
  const updateProp = useCallback((name: string, value: any) => {
    setState(prev => ({
      ...prev,
      props: {
        ...prev.props,
        [name]: value,
      },
    }));
  }, []);

  // Toggle dark mode
  const toggleDarkMode = useCallback(() => {
    setState(prev => ({
      ...prev,
      darkMode: !prev.darkMode,
    }));
  }, []);

  // Change viewport
  const setViewport = useCallback((viewport: 'mobile' | 'tablet' | 'desktop') => {
    setState(prev => ({
      ...prev,
      viewport,
    }));
  }, []);

  // Generate code snippet
  const generateCode = useCallback(() => {
    const props = Object.entries(state.props)
      .filter(([_, value]) => value !== undefined && value !== defaultProps[_])
      .map(([key, value]) => {
        if (typeof value === 'boolean') {
          return value ? key : '';
        } else if (typeof value === 'string') {
          return `${key}="${value}"`;
        } else if (typeof value === 'number') {
          return `${key}={${value}}`;
        } else {
          return `${key}={${JSON.stringify(value)}}`;
        }
      })
      .filter(Boolean)
      .join(' ');

    return `<${componentName}${props ? ' ' + props : ' '} />`;
  }, [state.props, componentName, defaultProps]);

  // Copy code to clipboard
  const copyCode = useCallback(async () => {
    const code = generateCode();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  }, [generateCode]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">Interactive Playground</h3>
        <div className="flex items-center gap-2">
          {/* Viewport Controls */}
          <div className="flex items-center gap-1 p-1 bg-surface rounded-lg border border-border">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setViewport('mobile')}
              className={state.viewport === 'mobile' ? 'bg-accent' : ''}
              title="Mobile view"
            >
              <Smartphone className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setViewport('tablet')}
              className={state.viewport === 'tablet' ? 'bg-accent' : ''}
              title="Tablet view"
            >
              <Tablet className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setViewport('desktop')}
              className={state.viewport === 'desktop' ? 'bg-accent' : ''}
              title="Desktop view"
            >
              <Monitor className="h-4 w-4" />
            </Button>
          </div>

          {/* Dark Mode Toggle */}
          <Button
            variant="outline"
            size="icon"
            onClick={toggleDarkMode}
            title={state.darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {state.darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="preview" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="code">Code</TabsTrigger>
        </TabsList>

        {/* Preview Tab */}
        <TabsContent value="preview" className="space-y-4">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Props Control Panel */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Props</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {propSchema.map(prop => (
                  <PropControl
                    key={prop.name}
                    prop={prop}
                    value={state.props[prop.name]}
                    onChange={(value) => updateProp(prop.name, value)}
                  />
                ))}

                {propSchema.length === 0 && (
                  <p className="text-sm text-text-muted">No configurable props</p>
                )}
              </CardContent>
            </Card>

            {/* Live Preview */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Live Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`mx-auto transition-all duration-300 ${viewportSizes[state.viewport]} ${
                    state.darkMode ? 'dark' : ''
                  }`}
                >
                  <div className="bg-background border border-border rounded-lg p-8 min-h-[200px] flex items-center justify-center">
                    <Component {...state.props} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Code Tab */}
        <TabsContent value="code">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Generated Code</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyCode}
                  className="gap-2"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="bg-surface p-4 rounded-lg overflow-x-auto">
                <code className="text-sm">{generateCode()}</code>
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface PropControlProps {
  prop: PropSchema;
  value: any;
  onChange: (value: any) => void;
}

function PropControl({ prop, value, onChange }: PropControlProps) {
  const renderControl = () => {
    switch (prop.type) {
      case 'boolean':
        return (
          <div className="flex items-center justify-between">
            <Label htmlFor={prop.name} className="cursor-pointer">
              {prop.name}
              {prop.description && (
                <span className="ml-2 text-xs text-text-muted">{prop.description}</span>
              )}
            </Label>
            <Switch
              id={prop.name}
              checked={value ?? prop.default ?? false}
              onCheckedChange={onChange}
            />
          </div>
        );

      case 'select':
        return (
          <div className="space-y-2">
            <Label htmlFor={prop.name}>
              {prop.name}
              {prop.description && (
                <span className="ml-2 text-xs text-text-muted">{prop.description}</span>
              )}
            </Label>
            <select
              id={prop.name}
              value={value ?? prop.default ?? ''}
              onChange={(e) => onChange(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-md"
            >
              {prop.options?.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        );

      case 'string':
        return (
          <div className="space-y-2">
            <Label htmlFor={prop.name}>
              {prop.name}
              {prop.description && (
                <span className="ml-2 text-xs text-text-muted">{prop.description}</span>
              )}
            </Label>
            <input
              id={prop.name}
              type="text"
              value={value ?? prop.default ?? ''}
              onChange={(e) => onChange(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-md"
            />
          </div>
        );

      case 'number':
        return (
          <div className="space-y-2">
            <Label htmlFor={prop.name}>
              {prop.name}
              {prop.description && (
                <span className="ml-2 text-xs text-text-muted">{prop.description}</span>
              )}
            </Label>
            <input
              id={prop.name}
              type="number"
              value={value ?? prop.default ?? 0}
              onChange={(e) => onChange(Number(e.target.value))}
              className="w-full px-3 py-2 bg-background border border-border rounded-md"
            />
          </div>
        );

      case 'color':
        return (
          <div className="space-y-2">
            <Label htmlFor={prop.name}>
              {prop.name}
              {prop.description && (
                <span className="ml-2 text-xs text-text-muted">{prop.description}</span>
              )}
            </Label>
            <div className="flex items-center gap-2">
              <input
                id={prop.name}
                type="color"
                value={value ?? prop.default ?? '#000000'}
                onChange={(e) => onChange(e.target.value)}
                className="w-12 h-10 rounded cursor-pointer"
              />
              <span className="text-sm text-text-muted font-mono">
                {value ?? prop.default ?? '#000000'}
              </span>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return <div className="space-y-2">{renderControl()}</div>;
}
