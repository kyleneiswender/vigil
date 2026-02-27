import { getRiskTier } from '../utils/scoringEngine';

function ScoreBar({ score }) {
  const { tier } = getRiskTier(score);
  const colorMap = {
    Critical: 'bg-red-500',
    High: 'bg-orange-500',
    Medium: 'bg-yellow-400',
    Low: 'bg-green-500',
  };
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-gray-200">
        <div
          className={`h-2 rounded-full transition-all ${colorMap[tier]}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-sm font-semibold text-gray-800">{score}</span>
    </div>
  );
}

function TierBadge({ score }) {
  const { tier, badge } = getRiskTier(score);
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge}`}>
      {tier}
    </span>
  );
}

function ExploitabilityBadge({ value }) {
  const styles = {
    Theoretical: 'bg-gray-100 text-gray-600',
    'PoC Exists': 'bg-purple-100 text-purple-700',
    'Actively Exploited': 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${styles[value] ?? 'bg-gray-100 text-gray-600'}`}>
      {value}
    </span>
  );
}

function CriticalityBadge({ value }) {
  const styles = {
    Low: 'bg-green-100 text-green-700',
    Medium: 'bg-yellow-100 text-yellow-700',
    High: 'bg-orange-100 text-orange-700',
    Critical: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${styles[value] ?? 'bg-gray-100 text-gray-600'}`}>
      {value}
    </span>
  );
}

export default function VulnTable({ vulnerabilities, onDelete }) {
  if (vulnerabilities.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Vulnerability Queue</h2>
          <p className="mt-0.5 text-sm text-gray-500">Sorted by composite risk score (highest first)</p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 text-4xl">🛡️</div>
          <p className="text-sm font-medium text-gray-500">No vulnerabilities added yet</p>
          <p className="mt-1 text-xs text-gray-400">Use the form above to add your first entry</p>
        </div>
      </div>
    );
  }

  // Sort descending by composite score
  const sorted = [...vulnerabilities].sort((a, b) => b.compositeScore - a.compositeScore);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Vulnerability Queue</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Sorted by composite risk score (highest first) &mdash;{' '}
              <span className="font-medium">{vulnerabilities.length}</span>{' '}
              {vulnerabilities.length === 1 ? 'entry' : 'entries'}
            </p>
          </div>
          <SummaryPills vulnerabilities={vulnerabilities} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                CVE ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Title
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                CVSS
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Criticality
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Exploitability
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                Internet
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                Age (days)
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                Assets
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Composite Score
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Risk Tier
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((vuln, index) => (
              <VulnRow
                key={vuln.id}
                vuln={vuln}
                rank={index + 1}
                onDelete={onDelete}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VulnRow({ vuln, rank, onDelete }) {
  const { bg, border } = getRiskTier(vuln.compositeScore);

  return (
    <tr className={`${bg} border-l-4 ${border} transition-colors hover:brightness-95`}>
      <td className="whitespace-nowrap px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600">
            {rank}
          </span>
          <span className="font-mono text-xs font-semibold text-blue-700">{vuln.cveId}</span>
        </div>
      </td>
      <td className="max-w-xs px-4 py-3">
        <span className="truncate block text-gray-900" title={vuln.title}>
          {vuln.title}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-center">
        <CvssChip score={vuln.cvssScore} />
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <CriticalityBadge value={vuln.assetCriticality} />
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <ExploitabilityBadge value={vuln.exploitability} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-center">
        {vuln.internetFacing ? (
          <span title="Internet facing" className="text-red-600">●</span>
        ) : (
          <span title="Internal only" className="text-gray-300">●</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-center text-gray-700">
        {vuln.daysSinceDiscovery}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-center text-gray-700">
        {vuln.affectedAssetCount.toLocaleString()}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <ScoreBar score={vuln.compositeScore} />
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <TierBadge score={vuln.compositeScore} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <button
          onClick={() => onDelete(vuln.id)}
          className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600 transition-colors"
          title="Delete"
          aria-label={`Delete ${vuln.cveId}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
          </svg>
        </button>
      </td>
    </tr>
  );
}

function CvssChip({ score }) {
  let cls = 'bg-gray-100 text-gray-700';
  if (score >= 9.0) cls = 'bg-red-600 text-white';
  else if (score >= 7.0) cls = 'bg-orange-500 text-white';
  else if (score >= 4.0) cls = 'bg-yellow-400 text-yellow-900';
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-bold ${cls}`}>
      {score.toFixed(1)}
    </span>
  );
}

function SummaryPills({ vulnerabilities }) {
  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  vulnerabilities.forEach((v) => {
    const { tier } = getRiskTier(v.compositeScore);
    counts[tier]++;
  });

  const pills = [
    { tier: 'Critical', count: counts.Critical, cls: 'bg-red-600 text-white' },
    { tier: 'High', count: counts.High, cls: 'bg-orange-500 text-white' },
    { tier: 'Medium', count: counts.Medium, cls: 'bg-yellow-400 text-yellow-900' },
    { tier: 'Low', count: counts.Low, cls: 'bg-green-500 text-white' },
  ];

  return (
    <div className="flex gap-2">
      {pills.map(({ tier, count, cls }) =>
        count > 0 ? (
          <span
            key={tier}
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}
            title={`${count} ${tier}`}
          >
            {count} {tier}
          </span>
        ) : null
      )}
    </div>
  );
}
