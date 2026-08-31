import Link from 'next/link';

export const metadata = {
  title: 'About — VivAI',
  description: 'VivAI is an uncensored AI chat interface, free from artificial restrictions.',
};

// Scattered hamster photos for the hero. hamster-1 appears once and flips
// itself horizontally on a loop; the rest each appear once too.
const HERO_IMAGES = [
  { src: '/images/about/hamster-1.png', top: '4%', left: '6%', size: 130, spin: 'spin-cw', duration: 7, selfMirror: true },
  { src: '/images/about/hamster-2.png', top: '2%', left: '42%', size: 105, spin: 'spin-cw', duration: 6 },
  { src: '/images/about/hamster-3.png', top: '38%', left: '86%', size: 130, spin: 'spin-ccw', duration: 8 },
  { src: '/images/about/hamster-4.png', top: '72%', left: '38%', size: 115, spin: 'spin-cw', duration: 5 },
  { src: '/images/about/hamster-5.png', top: '40%', left: '4%', size: 90, spin: 'spin-ccw', duration: 6 },
  { src: '/images/about/hamster-6.png', top: '5%', left: '64%', size: 125, spin: 'spin-cw', duration: 7 },
];

export default function AboutPage() {
  return (
    <div className="about-wrap">
      <header className="about-nav">
        <div className="about-nav-left">
          <Link href="/login" className="nav-btn nav-btn-ghost">
            Log in
          </Link>
          <Link href="/login?tab=register" className="nav-btn nav-btn-solid">
            Sign up
          </Link>
        </div>
      </header>

      <div className="hero-stage">
        {HERO_IMAGES.map((img, i) => (
          <div
            key={i}
            className={`hero-float ${img.spin}`}
            style={{
              top: img.top,
              left: img.left,
              width: img.size,
              height: img.size,
              animationDuration: `${img.duration}s`,
            }}
          >
            <img
              src={img.src}
              alt=""
              className={`hero-float-img ${img.selfMirror ? 'self-mirror' : ''}`}
            />
          </div>
        ))}

        <h1 className="hero-title">
          VivAI: <span>The Best Uncensored AI</span>
        </h1>
      </div>

      <main className="about-hero">
        <section className="about-section">
          <h2>No corporate filter</h2>
          <p>
            Most AI products are tuned to be as inoffensive as possible, which
            usually means they dodge hard questions, water down real answers, or
            flatly refuse to engage. VivAI skips that layer. You get direct,
            unfiltered responses to what you actually asked.
          </p>
        </section>

        <section className="about-section">
          <h2>Built for real conversations</h2>
          <p>
            Whether you&rsquo;re brainstorming, researching something sensitive,
            writing fiction, or just want a model that treats you like an adult,
            VivAI is designed to keep up &mdash; no lectures, no moralizing, no
            &ldquo;I can&rsquo;t help with that.&rdquo;
          </p>
        </section>

        <section className="about-section">
          <h2>Your account, your conversations</h2>
          <p>
            Create a free account to start chatting. Your messages stay tied to
            your account, and you&rsquo;re always in control of what you ask and
            how you use it.
          </p>
        </section>
      </main>
    </div>
  );
}
