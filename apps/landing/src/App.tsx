import { useState } from "react";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { McpVsSynapsee } from "./components/McpVsSynapsee";
import { WhoNeedsIt } from "./components/WhoNeedsIt";
import { HowItWorks } from "./components/HowItWorks";
import { PlatformArchitecture } from "./components/PlatformArchitecture";
import { Missions } from "./components/Missions";
import { Delivery } from "./components/Delivery";
import { Trust } from "./components/Trust";
import { EdgeSecurity } from "./components/EdgeSecurity";
import { Sources } from "./components/Sources";
import { Pricing } from "./components/Pricing";
import { Footer } from "./components/Footer";
import { WaitlistModal } from "./components/WaitlistModal";

/**
 * One thesis: Synapsee = Context Operating System.
 * Prepares executable context. Agents execute.
 * Mission Package = delivery format, not the product.
 *
 * Order: problem → contrast → why → journey → architecture →
 * missions → pack (consequence) → security → sources → pricing.
 */
export default function App() {
  const [modalOpen, setModalOpen] = useState(false);
  const openWaitlist = () => setModalOpen(true);

  return (
    <div className="min-h-screen bg-surface">
      <Header onConnect={openWaitlist} />
      <main>
        <Hero onConnect={openWaitlist} />
        <McpVsSynapsee />
        <WhoNeedsIt />
        <HowItWorks />
        <PlatformArchitecture />
        <Missions />
        <Delivery />
        <Trust />
        <EdgeSecurity />
        <Sources />
        <Pricing onConnect={openWaitlist} />
      </main>
      <Footer />
      <WaitlistModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
