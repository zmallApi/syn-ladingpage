import { useState } from "react";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { WhoNeedsIt } from "./components/WhoNeedsIt";
import { Architecture } from "./components/Architecture";
import { HowItWorks } from "./components/HowItWorks";
import { McpVsSynapsee } from "./components/McpVsSynapsee";
import { Deliverables } from "./components/Deliverables";
import { ProductChat } from "./components/ProductChat";
import { Sources } from "./components/Sources";
import { Trust } from "./components/Trust";
import { Pricing } from "./components/Pricing";
import { Footer } from "./components/Footer";
import { WaitlistModal } from "./components/WaitlistModal";

export default function App() {
  const [modalOpen, setModalOpen] = useState(false);
  const openWaitlist = () => setModalOpen(true);

  return (
    <div className="min-h-screen bg-surface">
      <Header onConnect={openWaitlist} />
      <main>
        <Hero onConnect={openWaitlist} />
        <WhoNeedsIt />
        <Architecture />
        <HowItWorks />
        <McpVsSynapsee />
        <Deliverables />
        <ProductChat />
        <Sources />
        <Trust />
        <Pricing onConnect={openWaitlist} />
      </main>
      <Footer />
      <WaitlistModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
