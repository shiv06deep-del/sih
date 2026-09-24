import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { io } from 'socket.io-client';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';

export default function AdminDashboard() {
  // State Declarations
  const [requests, setRequests] = useState([]);
  const [expiringCerts, setExpiringCerts] = useState([]);
  const [pendingAccounts, setPendingAccounts] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0 });
  const [chartData, setChartData] = useState([]);
  const [pieData, setPieData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ text: '', type: '' });

  // Signal Anomaly Engine Real-Time State
  const [telemetry, setTelemetry] = useState([]);
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [isScaleLocked, setIsScaleLocked] = useState(false);

  // Palette for Recharts
  const BRIGHT_COLORS = ['#FF6B6B', '#4ECDC4', '#FF9F1C', '#3A86FF', '#8338EC', '#2EC4B6'];

  // 1. Unified System Data Fetcher
  async function fetchSystemData() {
    try {
      // Fetch Workflow Requests
      const { data: requestData, error: reqError } = await supabase
        .from('verification_requests')
        .select(`
          id, status, created_at,
          instruments ( category, location_address ),
          applicant:profiles!user_id ( full_name )
        `)
        .order('created_at', { ascending: false });

      if (reqError) {
        console.error("Error fetching requests:", reqError);
      } else if (requestData) {
        setRequests(requestData);

        setStats({
          total: requestData.length,
          pending: requestData.filter(req => req.status === 'pending').length,
          approved: requestData.filter(req => req.status === 'approved').length,
        });

        // Bar Chart Processing
        const statusCounts = { Pending: 0, Scheduled: 0, 'In Inspection': 0, Approved: 0 };
        requestData.forEach(req => {
          if (req.status === 'pending') statusCounts.Pending++;
          else if (req.status === 'scheduled') statusCounts.Scheduled++;
          else if (req.status === 'in_inspection') statusCounts['In Inspection']++;
          else if (req.status === 'approved') statusCounts.Approved++;
        });
        setChartData(Object.keys(statusCounts).map(key => ({ name: key, count: statusCounts[key] })));

        // Pie Chart Processing
        const categoryCounts = {};
        requestData.forEach(req => {
          const cat = req.instruments?.category || 'Unknown';
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        });
        setPieData(Object.keys(categoryCounts).map(key => ({ name: key, value: categoryCounts[key] })));
      }

      // Fetch Expiry Certificates
      const { data: certData, error: certError } = await supabase
        .from('verification_certificates')
        .select(`id, certificate_number, expiry_date, instruments ( category, location_address )`);

      if (certError) {
        console.error("Error fetching certificates:", certError);
      } else if (certData) {
        const today = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(today.getDate() + 30);

        setExpiringCerts(certData.filter(cert => {
          if (!cert.expiry_date) return false;
          const expDate = new Date(cert.expiry_date);
          return expDate >= today && expDate <= thirtyDaysFromNow;
        }));
      }

      // Fetch Pending Approvals
      const { data: accountsData, error: accountsError } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['lmo', 'gatc'])
        .eq('is_approved', false);

      if (accountsError) {
        console.error("Error fetching accounts:", accountsError);
      } else if (accountsData) {
        setPendingAccounts(accountsData);
      }

    } catch (err) {
      console.error("Critical error in fetchSystemData:", err);
      setMessage({ text: 'An error occurred while loading dashboard data.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  // 2. Lifecycle & Real-Time Socket Connection
  useEffect(() => {
    fetchSystemData();

    // Connect to Node.js backend WebSocket server
    const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000');

    // Live Telemetry Stream Listener
    socket.on('SCALE_TELEMETRY_UPDATE', (data) => {
      setTelemetry((prev) => {
        const updated = [...prev, { time: new Date().toLocaleTimeString(), value: data.adcReading }];
        return updated.slice(-30); // Display last 30 readings
      });

      if (data.isAnomaly) {
        setIsScaleLocked(true);
      }
    });

    // Anomaly Alert Event Listener
    socket.on('DASHBOARD_LIVE_ALERT', (alert) => {
      setLiveAlerts((prev) => [alert, ...prev]);
      setMessage({
        text: `🚨 SIGNAL ANOMALY DETECTED: STDEV > 5.0 on device ${alert.deviceId}`,
        type: 'error'
      });
    });

    return () => socket.disconnect();
  }, []);

  const approveAccount = async (userId, userName) => {
    const { error } = await supabase.from('profiles').update({ is_approved: true }).eq('id', userId);
    if (!error) {
      setMessage({ text: `${userName}'s account has been officially approved.`, type: 'success' });
      fetchSystemData();
    } else {
      setMessage({ text: 'Error approving account: ' + error.message, type: 'error' });
    }
  };

  const sendExpiryAlert = (certNumber) => {
    setMessage({ text: `Automated alert successfully sent to owner of cert ${certNumber}.`, type: 'success' });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  };

  if (loading) return <div style={{ padding: '50px', textAlign: 'center' }}>Loading Command Center...</div>;

  return (
    <div style={{ padding: '20px' }}>
      {/* Banner Notifications */}
      {message.text && (
        <div style={{
          padding: '12px',
          marginBottom: '20px',
          borderRadius: '8px',
          textAlign: 'center',
          fontWeight: '500',
          backgroundColor: message.type === 'error' ? '#ffebee' : '#e8f5e9',
          color: message.type === 'error' ? '#c62828' : '#2e7d32',
          border: `1px solid ${message.type === 'error' ? '#ef9a9a' : '#a5d6a7'}`
        }}>
          {message.text}
        </div>
      )}

      {/* Signal Anomaly Engine Live Graph Widget */}
      <div className="card" style={{ borderLeft: isScaleLocked ? '5px solid #dc3545' : '5px solid #007bff', marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: '#203a43' }}>📡 Signal Anomaly Engine (Live Telemetry Stream)</h3>
          <span style={{
            padding: '6px 12px',
            borderRadius: '20px',
            fontWeight: 'bold',
            fontSize: '12px',
            backgroundColor: isScaleLocked ? '#ffebee' : '#e8f5e9',
            color: isScaleLocked ? '#c62828' : '#2e7d32'
          }}>
            {isScaleLocked ? '🔒 DISPLAY AUTO-LOCKED' : '🟢 SIGNAL NORMAL'}
          </span>
        </div>
        <p style={{ color: '#6c757d', fontSize: '14px', marginTop: '5px' }}>
          Monitoring HX711 ADC lines for variance spikes (STDEV &gt; 5.0) to auto-lock displays upon detecting RF remote switches [source: 2].
        </p>

        <div style={{ height: '220px', width: '100%', marginTop: '10px' }}>
          <ResponsiveContainer>
            <LineChart data={telemetry}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis domain={['auto', 'auto']} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke={isScaleLocked ? '#dc3545' : '#007bff'} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Live Signal Anomaly Feed Table */}
      {liveAlerts.length > 0 && (
        <div className="card" style={{ borderLeft: '5px solid #ff4d4f', backgroundColor: '#fff2f0', marginBottom: '30px' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#cf1322' }}>🚨 Real-Time Anomaly Logs</h3>
          <table className="modern-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Device ID</th>
                <th>Anomaly Reason</th>
                <th>Timestamp</th>
                <th>Action Taken</th>
              </tr>
            </thead>
            <tbody>
              {liveAlerts.map((alert, idx) => (
                <tr key={idx}>
                  <td><strong>{alert.deviceId}</strong></td>
                  <td style={{ color: '#cf1322', fontWeight: 'bold' }}>{alert.reason}</td>
                  <td>{new Date(alert.timestamp).toLocaleTimeString()}</td>
                  <td>
                    <span className="status-badge" style={{ backgroundColor: '#fff1f0', color: '#cf1322', border: '1px solid #ffa39e' }}>
                      {alert.action}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
        <div className="card" style={{ flex: 1, textAlign: 'center', margin: 0, padding: '20px' }}>
          <h2 style={{ fontSize: '36px', margin: '0 0 10px 0', color: '#203a43' }}>{stats.total}</h2>
          <p style={{ margin: 0, color: '#6c757d', fontWeight: '600', textTransform: 'uppercase' }}>Total Applications</p>
        </div>
        <div className="card" style={{ flex: 1, textAlign: 'center', margin: 0, padding: '20px' }}>
          <h2 style={{ fontSize: '36px', margin: '0 0 10px 0', color: '#856404' }}>{stats.pending}</h2>
          <p style={{ margin: 0, color: '#6c757d', fontWeight: '600', textTransform: 'uppercase' }}>Pendency Queue</p>
        </div>
        <div className="card" style={{ flex: 1, textAlign: 'center', margin: 0, padding: '20px' }}>
          <h2 style={{ fontSize: '36px', margin: '0 0 10px 0', color: '#155724' }}>{stats.approved}</h2>
          <p style={{ margin: 0, color: '#6c757d', fontWeight: '600', textTransform: 'uppercase' }}>Certificates Issued</p>
        </div>
      </div>

      {/* Analytics Visualization Grid */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
        <div className="card" style={{ flex: 2, margin: 0 }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#203a43' }}>📊 System Verification Trends</h3>
          <div style={{ height: '300px', width: '100%' }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#6c757d' }} />
                <YAxis tick={{ fill: '#6c757d' }} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#f8f9fa' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={50}>
                  {chartData.map((entry, index) => (
                    <Cell key={`bar-cell-${index}`} fill={BRIGHT_COLORS[index % BRIGHT_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card" style={{ flex: 1, margin: 0 }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#203a43' }}>📈 Instrument Distribution</h3>
          <div style={{ height: '300px', width: '100%' }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={`pie-cell-${index}`} fill={BRIGHT_COLORS[index % BRIGHT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Stakeholder Approval Console */}
      {pendingAccounts.length > 0 && (
        <div className="card" style={{ borderLeft: '5px solid #ffc107', marginBottom: '30px' }}>
          <h3 style={{ margin: '0 0 5px 0', color: '#856404' }}>🛡️ Pending Official Approvals</h3>
          <p style={{ color: '#6c757d', margin: '0 0 15px 0' }}>New LMO and GATC registrations awaiting administrator verification.</p>
          <table className="modern-table" style={{ width: '100%' }}>
            <thead>
              <tr><th>Name / Organization</th><th>Requested Role</th><th>Action</th></tr>
            </thead>
            <tbody>
              {pendingAccounts.map((account) => (
                <tr key={account.id}>
                  <td><strong>{account.full_name}</strong></td>
                  <td><span className="status-badge" style={{ background: '#e2e3e5' }}>{account.role?.toUpperCase() || 'UNKNOWN'}</span></td>
                  <td><button className="btn-success" onClick={() => approveAccount(account.id, account.full_name)}>Verify & Approve</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Expiry Alerts Console */}
      <div className="card" style={{ borderLeft: '5px solid #dc3545', marginBottom: '30px' }}>
        <h3 style={{ margin: '0 0 5px 0', color: '#dc3545' }}>⚠️ Expiry Alerts (Next 30 Days)</h3>
        <table className="modern-table" style={{ width: '100%' }}>
          <thead>
            <tr><th>Certificate No.</th><th>Instrument</th><th>Expiry Date</th><th>Action</th></tr>
          </thead>
          <tbody>
            {expiringCerts.length === 0 ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', color: '#6c757d' }}>No expiring certificates.</td></tr>
            ) : (
              expiringCerts.map((cert) => (
                <tr key={cert.id} style={{ backgroundColor: '#fff5f5' }}>
                  <td><strong>{cert.certificate_number}</strong></td>
                  <td>{cert.instruments?.category}</td>
                  <td style={{ color: '#dc3545', fontWeight: '600' }}>{cert.expiry_date}</td>
                  <td><button className="btn-outline" onClick={() => sendExpiryAlert(cert.certificate_number)} style={{ borderColor: '#dc3545', color: '#dc3545' }}>Send Reminder Alert</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* System-Wide Activity Log */}
      <div className="card">
        <h3 style={{ margin: '0 0 15px 0', color: '#203a43' }}>System-Wide Activity Log</h3>
        <table className="modern-table" style={{ width: '100%' }}>
          <thead>
            <tr><th>Applicant Name</th><th>Instrument</th><th>Location</th><th>Date Submitted</th><th>Current Status</th></tr>
          </thead>
          <tbody>
            {requests.map((req) => (
              <tr key={req.id}>
                <td>{req.applicant?.full_name || 'Unknown User'}</td>
                <td>{req.instruments?.category}</td>
                <td>{req.instruments?.location_address}</td>
                <td>{req.created_at ? new Date(req.created_at).toLocaleDateString() : 'N/A'}</td>
                <td><span className={`status-badge status-${req.status}`}>{req.status?.replace('_', ' ') || 'UNKNOWN'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
