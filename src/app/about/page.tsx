import Link from 'next/link';
import type { Metadata } from 'next';
import {
  Mail,
  Calendar,
  Users,
  Building2,
  FolderKanban,
  Hash,
  Wrench,
  Network,
  GitBranch,
  UserCheck,
  CheckSquare,
  ListTodo,
  RefreshCw,
  MessageSquare,
  Search,
  Lightbulb,
  ThumbsUp,
  ThumbsDown,
  GraduationCap,
  Shield,
  Lock,
  Trash2,
  ArrowLeft,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'About Izzie - Your AI-Powered Personal Assistant',
  description:
    'Learn how Izzie transforms your email and calendar into actionable intelligence through entity extraction, relationship discovery, and intelligent chat.',
};

/**
 * About Page
 * Comprehensive overview of Izzie's features and capabilities
 */
export default function AboutPage() {
  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-blue-50" />
      <div
        className="absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgb(148 163 184 / 0.3) 1px, transparent 0)`,
          backgroundSize: '24px 24px',
        }}
      />

      {/* Decorative gradient orbs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-indigo-400/20 rounded-full blur-3xl" />
      <div className="absolute top-3/4 left-1/2 w-64 h-64 bg-purple-400/10 rounded-full blur-3xl" />

      {/* Content */}
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">
        {/* Navigation */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Izzie
          </Link>
        </div>

        {/* Hero Section */}
        <section className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-6 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl shadow-lg shadow-blue-500/25">
            <Mail className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4">
            About Izzie
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Your AI-powered personal assistant that transforms your email and calendar into
            actionable intelligence
          </p>
        </section>

        {/* Features Section */}
        <section className="space-y-12 mb-16">
          {/* Feature 1: Email & Calendar Intelligence */}
          <FeatureCard
            icon={<Mail className="w-6 h-6" />}
            iconBg="bg-blue-100 text-blue-600"
            title="Email & Calendar Intelligence"
            description="Izzie connects directly to your Gmail and Google Calendar to understand your professional world."
          >
            <FeatureList
              items={[
                {
                  icon: <Mail className="w-4 h-4" />,
                  text: 'Connects to your Gmail and Google Calendar',
                },
                {
                  icon: <Search className="w-4 h-4" />,
                  text: 'Processes your communications to understand context',
                },
                {
                  icon: <UserCheck className="w-4 h-4" />,
                  text: 'Focuses on YOUR sent emails to understand your work',
                },
              ]}
            />
          </FeatureCard>

          {/* Feature 2: Entity Extraction */}
          <FeatureCard
            icon={<Users className="w-6 h-6" />}
            iconBg="bg-indigo-100 text-indigo-600"
            title="Entity Extraction"
            description="Izzie automatically identifies and organizes the key entities in your professional life."
          >
            <div className="grid sm:grid-cols-2 gap-3">
              <EntityItem icon={<Users className="w-4 h-4" />} label="People" />
              <EntityItem icon={<Building2 className="w-4 h-4" />} label="Companies" />
              <EntityItem icon={<FolderKanban className="w-4 h-4" />} label="Projects" />
              <EntityItem icon={<Hash className="w-4 h-4" />} label="Topics" />
              <EntityItem icon={<Wrench className="w-4 h-4" />} label="Tools & Services" />
              <EntityItem icon={<Network className="w-4 h-4" />} label="Knowledge Graph" />
            </div>
          </FeatureCard>

          {/* Feature 3: Relationship Discovery */}
          <FeatureCard
            icon={<GitBranch className="w-6 h-6" />}
            iconBg="bg-purple-100 text-purple-600"
            title="Relationship Discovery"
            description="Understand the connections between people and organizations in your network."
          >
            <FeatureList
              items={[
                {
                  icon: <Network className="w-4 h-4" />,
                  text: 'Maps connections between people and organizations',
                },
                {
                  icon: <Users className="w-4 h-4" />,
                  text: 'Tracks who works with whom',
                },
                {
                  icon: <GitBranch className="w-4 h-4" />,
                  text: 'Understands reporting structures and collaborations',
                },
              ]}
            />
          </FeatureCard>

          {/* Feature 4: Action Item Tracking */}
          <FeatureCard
            icon={<CheckSquare className="w-6 h-6" />}
            iconBg="bg-green-100 text-green-600"
            title="Action Item Tracking"
            description="Never miss a commitment or deadline again."
          >
            <FeatureList
              items={[
                {
                  icon: <ListTodo className="w-4 h-4" />,
                  text: 'Extracts tasks and commitments from emails',
                },
                {
                  icon: <RefreshCw className="w-4 h-4" />,
                  text: 'Automatically syncs to Google Tasks',
                },
                {
                  icon: <CheckSquare className="w-4 h-4" />,
                  text: 'Keeps you on top of your obligations',
                },
              ]}
            />
          </FeatureCard>

          {/* Feature 5: Intelligent Chat */}
          <FeatureCard
            icon={<MessageSquare className="w-6 h-6" />}
            iconBg="bg-amber-100 text-amber-600"
            title="Intelligent Chat"
            description="Have context-aware conversations about your work."
          >
            <FeatureList
              items={[
                {
                  icon: <Lightbulb className="w-4 h-4" />,
                  text: 'Context-aware conversations about your work',
                },
                {
                  icon: <Search className="w-4 h-4" />,
                  text: 'Ask about people, projects, or commitments',
                },
                {
                  icon: <MessageSquare className="w-4 h-4" />,
                  text: 'Get summaries and insights on demand',
                },
              ]}
            />
          </FeatureCard>

          {/* Feature 6: Human-in-the-Loop Training */}
          <FeatureCard
            icon={<GraduationCap className="w-6 h-6" />}
            iconBg="bg-rose-100 text-rose-600"
            title="Human-in-the-Loop Training"
            description="You're in control of what Izzie learns."
          >
            <FeatureList
              items={[
                {
                  icon: <ThumbsUp className="w-4 h-4" />,
                  text: 'Review and correct AI extractions',
                },
                {
                  icon: <GraduationCap className="w-4 h-4" />,
                  text: 'Your feedback improves accuracy over time',
                },
                {
                  icon: <ThumbsDown className="w-4 h-4" />,
                  text: 'Full control over what Izzie learns',
                },
              ]}
            />
          </FeatureCard>
        </section>

        {/* Privacy Section */}
        <section className="mb-16">
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-12 h-12 bg-slate-100 rounded-xl text-slate-600">
                <Shield className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Your Privacy Matters</h2>
            </div>

            <div className="grid sm:grid-cols-3 gap-6">
              <PrivacyItem
                icon={<Lock className="w-5 h-5" />}
                title="Your Data Stays Yours"
                description="All your data is encrypted and securely stored. We never share your information with third parties."
              />
              <PrivacyItem
                icon={<Shield className="w-5 h-5" />}
                title="No Data Sharing"
                description="Your emails, calendar, and extracted information are never sold or shared with advertisers or third parties."
              />
              <PrivacyItem
                icon={<Trash2 className="w-5 h-5" />}
                title="Delete Anytime"
                description="You can delete all your data at any time. Full control over your information, always."
              />
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="text-center mb-16">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-8 shadow-lg shadow-blue-500/25">
            <h2 className="text-2xl font-bold text-white mb-3">Ready to get started?</h2>
            <p className="text-blue-100 mb-6">
              Connect your Google account and let Izzie transform how you work.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white hover:bg-slate-50 text-blue-600 font-semibold rounded-xl shadow-sm transition-all duration-200"
            >
              Sign in with Google
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-8 border-t border-slate-200">
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div className="flex flex-wrap gap-4 text-sm text-slate-500">
              <Link href="/" className="hover:text-slate-700 transition-colors">
                Home
              </Link>
              <span className="text-slate-300">|</span>
              <Link href="/terms" className="hover:text-slate-700 transition-colors">
                Terms of Service
              </Link>
              <span className="text-slate-300">|</span>
              <Link href="/privacy" className="hover:text-slate-700 transition-colors">
                Privacy Policy
              </Link>
            </div>
            <div className="text-sm text-slate-500">
              Contact:{' '}
              <a href="mailto:izzie@matsuoka.com" className="text-blue-600 hover:underline">
                izzie@matsuoka.com
              </a>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

/**
 * Feature Card Component
 */
function FeatureCard({
  icon,
  iconBg,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4 mb-4">
        <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${iconBg}`}>
          {icon}
        </div>
        <div>
          <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
          <p className="text-slate-600 mt-1">{description}</p>
        </div>
      </div>
      <div className="ml-0 sm:ml-16">{children}</div>
    </div>
  );
}

/**
 * Feature List Component
 */
function FeatureList({
  items,
}: {
  items: Array<{ icon: React.ReactNode; text: string }>;
}) {
  return (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-3">
          <span className="flex-shrink-0 mt-0.5 text-slate-400">{item.icon}</span>
          <span className="text-slate-600">{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Entity Item Component
 */
function EntityItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
      <span className="text-slate-500">{icon}</span>
      <span className="text-slate-700 font-medium">{label}</span>
    </div>
  );
}

/**
 * Privacy Item Component
 */
function PrivacyItem({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center sm:text-left">
      <div className="flex justify-center sm:justify-start mb-3">
        <div className="flex items-center justify-center w-10 h-10 bg-slate-100 rounded-lg text-slate-600">
          {icon}
        </div>
      </div>
      <h3 className="font-semibold text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-600">{description}</p>
    </div>
  );
}
