/**
 * MCP Settings Page
 * Configure and manage MCP server connections
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

type MCPTransport = 'stdio' | 'sse' | 'http';

interface MCPServer {
  id: string;
  name: string;
  transport: MCPTransport;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
}

interface MCPTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface ServerStatus {
  status: 'connected' | 'disconnected' | 'error';
  tools: MCPTool[];
  resources: MCPResource[];
  error?: string;
}

export default function MCPSettingsPage() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [serverStatuses, setServerStatuses] = useState<Record<string, ServerStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    transport: 'stdio' as MCPTransport,
    command: '',
    args: '',
    url: '',
    headers: '',
    enabled: true,
  });

  // Fetch servers
  const fetchServers = useCallback(async () => {
    try {
      const response = await fetch('/api/mcp/servers');
      if (!response.ok) throw new Error('Failed to fetch servers');
      const data = await response.json();
      setServers(data.servers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load servers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // Connect to server
  const connectServer = async (serverId: string) => {
    try {
      setServerStatuses((prev) => ({
        ...prev,
        [serverId]: { status: 'disconnected', tools: [], resources: [], error: 'Connecting...' },
      }));

      const response = await fetch(`/api/mcp/servers/${serverId}/connect`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect');
      }

      setServerStatuses((prev) => ({
        ...prev,
        [serverId]: {
          status: data.status,
          tools: data.tools || [],
          resources: data.resources || [],
          error: data.error,
        },
      }));
    } catch (err) {
      setServerStatuses((prev) => ({
        ...prev,
        [serverId]: {
          status: 'error',
          tools: [],
          resources: [],
          error: err instanceof Error ? err.message : 'Connection failed',
        },
      }));
    }
  };

  // Disconnect from server
  const disconnectServer = async (serverId: string) => {
    try {
      await fetch(`/api/mcp/servers/${serverId}/connect`, {
        method: 'DELETE',
      });

      setServerStatuses((prev) => ({
        ...prev,
        [serverId]: { status: 'disconnected', tools: [], resources: [] },
      }));
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  };

  // Add or update server
  const saveServer = async () => {
    try {
      const payload: Partial<MCPServer> = {
        name: formData.name,
        transport: formData.transport,
        enabled: formData.enabled,
      };

      if (formData.transport === 'stdio') {
        payload.command = formData.command;
        payload.args = formData.args
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        payload.url = formData.url;
        if (formData.headers.trim()) {
          try {
            payload.headers = JSON.parse(formData.headers);
          } catch {
            setError('Invalid JSON for headers');
            return;
          }
        }
      }

      const url = editingServer
        ? `/api/mcp/servers/${editingServer.id}`
        : '/api/mcp/servers';
      const method = editingServer ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save server');
      }

      await fetchServers();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save server');
    }
  };

  // Delete server
  const deleteServer = async (serverId: string) => {
    if (!confirm('Are you sure you want to delete this server?')) return;

    try {
      const response = await fetch(`/api/mcp/servers/${serverId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete server');

      await fetchServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete server');
    }
  };

  // Toggle server enabled state
  const toggleServer = async (server: MCPServer) => {
    try {
      const response = await fetch(`/api/mcp/servers/${server.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !server.enabled }),
      });

      if (!response.ok) throw new Error('Failed to update server');

      await fetchServers();

      // Disconnect if disabling
      if (server.enabled) {
        await disconnectServer(server.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle server');
    }
  };

  // Open modal for editing
  const openEditModal = (server: MCPServer) => {
    setEditingServer(server);
    setFormData({
      name: server.name,
      transport: server.transport,
      command: server.command || '',
      args: (server.args || []).join('\n'),
      url: server.url || '',
      headers: server.headers ? JSON.stringify(server.headers, null, 2) : '',
      enabled: server.enabled,
    });
    setShowAddModal(true);
  };

  // Close modal
  const closeModal = () => {
    setShowAddModal(false);
    setEditingServer(null);
    setFormData({
      name: '',
      transport: 'stdio',
      command: '',
      args: '',
      url: '',
      headers: '',
      enabled: true,
    });
  };

  // Get status color
  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'connected':
        return '#10b981';
      case 'error':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading MCP servers...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: '700', color: '#111', marginBottom: '0.5rem' }}>
          MCP Connectors
        </h1>
        <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
          Connect to external tools and services using the Model Context Protocol
        </p>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.875rem',
            fontWeight: '500',
            cursor: 'pointer',
          }}
        >
          + Add Server
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#fee2e2',
            border: '1px solid #f87171',
            borderRadius: '6px',
            marginBottom: '1rem',
          }}
        >
          <p style={{ fontSize: '0.875rem', color: '#dc2626' }}>{error}</p>
          <button
            onClick={() => setError(null)}
            style={{ fontSize: '0.75rem', color: '#dc2626', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Server list */}
      {servers.length === 0 ? (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            backgroundColor: '#f9fafb',
            borderRadius: '8px',
            border: '1px dashed #d1d5db',
          }}
        >
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>No MCP servers configured yet.</p>
          <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
            Add your first server to connect Izzie to external tools and services.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {servers.map((server) => {
            const status = serverStatuses[server.id];
            const isExpanded = expandedServer === server.id;

            return (
              <div
                key={server.id}
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}
              >
                {/* Server header */}
                <div
                  style={{
                    padding: '1rem 1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {/* Status indicator */}
                    <div
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: getStatusColor(status?.status),
                      }}
                    />

                    <div>
                      <h3 style={{ fontWeight: '600', color: '#111' }}>{server.name}</h3>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {server.transport.toUpperCase()} •{' '}
                        {server.transport === 'stdio' ? server.command : server.url}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {/* Toggle enabled */}
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={server.enabled}
                        onChange={() => toggleServer(server)}
                        style={{ marginRight: '0.5rem' }}
                      />
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Enabled</span>
                    </label>

                    {/* Connect/Disconnect */}
                    {server.enabled && (
                      <>
                        {status?.status === 'connected' ? (
                          <button
                            onClick={() => disconnectServer(server.id)}
                            style={{
                              padding: '0.25rem 0.75rem',
                              backgroundColor: '#fee2e2',
                              color: '#dc2626',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            Disconnect
                          </button>
                        ) : (
                          <button
                            onClick={() => connectServer(server.id)}
                            style={{
                              padding: '0.25rem 0.75rem',
                              backgroundColor: '#dcfce7',
                              color: '#16a34a',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            Connect
                          </button>
                        )}
                      </>
                    )}

                    {/* Expand/Collapse */}
                    <button
                      onClick={() => setExpandedServer(isExpanded ? null : server.id)}
                      style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: '#f3f4f6',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      {isExpanded ? '▲' : '▼'}
                    </button>

                    {/* Edit */}
                    <button
                      onClick={() => openEditModal(server)}
                      style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: '#f3f4f6',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      Edit
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => deleteServer(server.id)}
                      style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: '#fee2e2',
                        color: '#dc2626',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                    {status?.error && (
                      <p style={{ color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>
                        Error: {status.error}
                      </p>
                    )}

                    {status?.tools && status.tools.length > 0 && (
                      <div style={{ marginBottom: '1rem' }}>
                        <h4 style={{ fontWeight: '600', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                          Available Tools ({status.tools.length})
                        </h4>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {status.tools.map((tool) => (
                            <div
                              key={tool.name}
                              style={{
                                padding: '0.5rem 0.75rem',
                                backgroundColor: '#fff',
                                border: '1px solid #e5e7eb',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                              }}
                            >
                              <span style={{ fontWeight: '500' }}>{tool.name}</span>
                              {tool.description && (
                                <p style={{ color: '#6b7280', marginTop: '0.25rem' }}>
                                  {tool.description}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {status?.resources && status.resources.length > 0 && (
                      <div>
                        <h4 style={{ fontWeight: '600', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                          Available Resources ({status.resources.length})
                        </h4>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {status.resources.map((resource) => (
                            <div
                              key={resource.uri}
                              style={{
                                padding: '0.5rem 0.75rem',
                                backgroundColor: '#fff',
                                border: '1px solid #e5e7eb',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                              }}
                            >
                              <span style={{ fontWeight: '500' }}>{resource.name}</span>
                              {resource.description && (
                                <p style={{ color: '#6b7280', marginTop: '0.25rem' }}>
                                  {resource.description}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(!status || (status.tools.length === 0 && status.resources.length === 0)) && !status?.error && (
                      <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                        Connect to this server to see available tools and resources.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '500px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1.5rem' }}>
              {editingServer ? 'Edit Server' : 'Add MCP Server'}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Name */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                  Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My MCP Server"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              {/* Transport */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                  Transport
                </label>
                <select
                  value={formData.transport}
                  onChange={(e) => setFormData({ ...formData, transport: e.target.value as MCPTransport })}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                >
                  <option value="stdio">stdio (Local Process)</option>
                  <option value="sse">SSE (Server-Sent Events)</option>
                  <option value="http">HTTP (REST API)</option>
                </select>
              </div>

              {/* Stdio fields */}
              {formData.transport === 'stdio' && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                      Command
                    </label>
                    <input
                      type="text"
                      value={formData.command}
                      onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                      placeholder="npx"
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                      Arguments (one per line)
                    </label>
                    <textarea
                      value={formData.args}
                      onChange={(e) => setFormData({ ...formData, args: e.target.value })}
                      placeholder="-y&#10;@modelcontextprotocol/server-filesystem"
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        fontFamily: 'monospace',
                      }}
                    />
                  </div>
                </>
              )}

              {/* SSE/HTTP fields */}
              {(formData.transport === 'sse' || formData.transport === 'http') && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                      URL
                    </label>
                    <input
                      type="url"
                      value={formData.url}
                      onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                      placeholder="https://mcp-server.example.com"
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                      Headers (JSON)
                    </label>
                    <textarea
                      value={formData.headers}
                      onChange={(e) => setFormData({ ...formData, headers: e.target.value })}
                      placeholder='{"Authorization": "Bearer ..."}'
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        fontFamily: 'monospace',
                      }}
                    />
                  </div>
                </>
              )}

              {/* Enabled */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <span style={{ fontSize: '0.875rem' }}>Enabled</span>
                </label>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button
                  onClick={closeModal}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#f3f4f6',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveServer}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  {editingServer ? 'Update' : 'Add Server'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
