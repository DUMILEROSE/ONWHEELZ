import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { MARKET_REGIONS } from "@shared/const";
import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { useLocation } from "wouter";
import {
  AffiliateAttributionPanel,
  NetworkVerificationDesk,
  SellerConversionPanel,
} from "@/components/NetworkOpsPanels";
import { SellerWebhookPanel } from "@/components/SellerWebhookPanel";
import { AffiliatePayPalSettingsPanel } from "@/components/AffiliatePayPalSettingsPanel";
import { PayPalPayoutAdminPanel } from "@/components/PayPalPayoutAdminPanel";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CarFront,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Compass,
  Disc3,
  Globe2,
  Instagram,
  Menu,
  Package,
  Plane,
  Plus,
  Search,
  Store,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";

type MarketplaceOffer =
  inferRouterOutputs<AppRouter>["marketplace"]["list"][number];
type View = "marketplace" | "affiliate" | "seller" | "network";

const categories = [
  { label: "Everything", value: "All", icon: Compass },
  { label: "Vehicles", value: "Vehicles", icon: CarFront },
  { label: "Parts & gear", value: "Parts & accessories", icon: Wrench },
  { label: "Services", value: "Services", icon: CircleDollarSign },
  { label: "Aircraft", value: "Aircraft & aviation", icon: Plane },
  { label: "More with wheels", value: "Other wheeled goods", icon: Package },
];

const categoryMood: Record<string, string> = {
  Vehicles: "tangerine",
  "Parts & accessories": "steel",
  Services: "mint",
  "Aircraft & aviation": "sky",
  "Other wheeled goods": "violet",
};

const categoryArtwork: Record<string, string> = {
  Vehicles: "/manus-storage/vehicles_2dc62e5e.jpg",
  "Parts & accessories": "/manus-storage/parts_25356ad7.jpg",
  Services: "/manus-storage/services_e4113e5d.jpg",
  "Aircraft & aviation": "/manus-storage/aircraft_ef5f9249.jpg",
  "Other wheeled goods": "/manus-storage/other-mobility_2bc7e29e.jpg",
};

function money(value: string | number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function moneyExact(value: string | number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function shortDate(value: Date | string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function StatusPill({ status }: { status: string }) {
  const label: Record<string, string> = {
    pending: "In review",
    approved: "Approved",
    more_details: "Details requested",
    declined: "Not approved",
    active: "Live",
    draft: "Draft",
    paused: "Paused",
    verified: "Verified",
    rejected: "Update required",
    paid: "Paid",
  };
  return (
    <span className={`status-pill status-${status}`}>
      {label[status] ?? status}
    </span>
  );
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`form-field${wide ? " form-field-wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function OfferArt({ offer }: { offer: MarketplaceOffer }) {
  const Icon =
    offer.category === "Aircraft & aviation"
      ? Plane
      : offer.category === "Parts & accessories"
        ? Wrench
        : offer.category === "Services"
          ? CircleDollarSign
          : offer.category === "Vehicles"
            ? CarFront
            : Disc3;
  return (
    <div
      className={`offer-art art-${categoryMood[offer.category] ?? "tangerine"}`}
    >
      {offer.imageUrl || categoryArtwork[offer.category] ? (
        <img
          src={offer.imageUrl || categoryArtwork[offer.category]}
          alt={offer.title}
          loading="lazy"
          decoding="async"
          onError={event => {
            const fallback = categoryArtwork[offer.category];
            if (
              fallback &&
              event.currentTarget.dataset.fallbackApplied !== "true"
            ) {
              event.currentTarget.dataset.fallbackApplied = "true";
              event.currentTarget.src = fallback;
            } else {
              event.currentTarget.style.display = "none";
            }
          }}
        />
      ) : null}
      <div className="art-caption">
        <span>ONWHEELZ SELECT</span>
        <Icon aria-hidden="true" size={42} strokeWidth={1.25} />
      </div>
      <div className="art-mark">
        {offer.category === "Aircraft & aviation"
          ? "ALTITUDE"
          : offer.category === "Parts & accessories"
            ? "BUILT TO MOVE"
            : "MOBILITY GOODS"}
      </div>
    </div>
  );
}

function OfferCard({
  offer,
  onApply,
}: {
  offer: MarketplaceOffer;
  onApply: (offer: MarketplaceOffer) => void;
}) {
  return (
    <article className="offer-card">
      <OfferArt offer={offer} />
      <div className="offer-card-body">
        <div className="offer-meta">
          <span>{offer.category}</span>
          <span className="meta-dot" />
          <span>{offer.region === "Global" ? "Worldwide" : offer.region}</span>
          <span className="meta-dot" /> <span>{offer.companyName}</span>
        </div>
        <h3>{offer.title}</h3>
        <p className="offer-description">{offer.description}</p>
        <div className="offer-bottom">
          <div>
            <span className="offer-price">
              {money(offer.price, offer.currency)}
            </span>
            <span className="offer-sub">starting price</span>
          </div>
          <div className="commission-chip">
            <strong>{Number(offer.commissionPercent)}%</strong>
            <span>commission</span>
          </div>
        </div>
        <button
          className="button button-dark button-full"
          onClick={() => onApply(offer)}
        >
          Request approval <ArrowUpRight size={16} />
        </button>
      </div>
    </article>
  );
}

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const referralCode =
    location.match(/^\/r\/([A-Za-z0-9_-]{12,32})\/?$/)?.[1] ?? null;
  const view: View =
    location === "/affiliate"
      ? "affiliate"
      : location === "/seller"
        ? "seller"
        : location === "/network"
          ? "network"
          : "marketplace";
  const setView = (nextView: View) =>
    setLocation(
      nextView === "marketplace"
        ? "/"
        : nextView === "network"
          ? "/network"
          : `/${nextView}`
    );
  const [category, setCategory] = useState("All");
  const [region, setRegion] = useState<(typeof MARKET_REGIONS)[number] | "All">(
    "All"
  );
  const [search, setSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [applicationOffer, setApplicationOffer] =
    useState<MarketplaceOffer | null>(null);
  const [offerFormOpen, setOfferFormOpen] = useState(false);
  const [sellerForm, setSellerForm] = useState({
    businessName: "",
    website: "",
    contactEmail: "",
    description: "",
  });
  const [affiliateForm, setAffiliateForm] = useState({
    channels: "",
    audienceSize: "",
    bio: "",
    message: "",
  });
  const [offerForm, setOfferForm] = useState({
    title: "",
    category: "Vehicles",
    region: "Global" as (typeof MARKET_REGIONS)[number],
    description: "",
    price: "",
    commissionPercent: "12",
    destinationUrl: "",
    imageUrl: "",
    status: "draft" as "active" | "draft",
  });
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [conversionApplication, setConversionApplication] = useState<{
    id: number;
    title: string;
    affiliateName: string | null;
    commissionPercent: string;
  } | null>(null);
  const [conversionForm, setConversionForm] = useState({
    orderReference: "",
    saleAmount: "",
  });

  const marketplaceFilters = useMemo(
    () => ({
      category: category === "All" ? undefined : category,
      search: search.trim() || undefined,
      region: region === "All" ? undefined : region,
    }),
    [category, search, region]
  );
  const referralInput = useMemo(
    () => ({ code: referralCode ?? "" }),
    [referralCode]
  );
  const marketplaceQuery = trpc.marketplace.list.useQuery(marketplaceFilters);
  const referralQuery = trpc.marketplace.trackReferral.useQuery(referralInput, {
    enabled: Boolean(referralCode),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const affiliateQuery = trpc.affiliate.workspace.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const sellerQuery = trpc.seller.workspace.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const networkQuery = trpc.network.verificationQueue.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });
  const utils = trpc.useUtils();

  const applyMutation = trpc.affiliate.requestToPromote.useMutation({
    onSuccess: async () => {
      toast.success("Request sent. The seller will review your profile.");
      setApplicationOffer(null);
      setAffiliateForm(form => ({ ...form, message: "" }));
      await utils.affiliate.workspace.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const saveAffiliateMutation = trpc.affiliate.saveProfile.useMutation({
    onSuccess: async () => {
      toast.success("Affiliate profile saved.");
      await utils.affiliate.workspace.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const registerSellerMutation = trpc.seller.register.useMutation({
    onSuccess: async () => {
      toast.success("Seller profile submitted for ONWHEELZ review.");
      await utils.seller.workspace.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const createOfferMutation = trpc.seller.createOffer.useMutation({
    onSuccess: async () => {
      toast.success("Offer added to your seller desk.");
      setOfferFormOpen(false);
      setOfferForm({
        title: "",
        category: "Vehicles",
        region: "Global",
        description: "",
        price: "",
        commissionPercent: "12",
        destinationUrl: "",
        imageUrl: "",
        status: "draft",
      });
      await Promise.all([
        utils.seller.workspace.invalidate(),
        utils.marketplace.list.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });
  const reviewMutation = trpc.seller.reviewApplication.useMutation({
    onSuccess: async () => {
      toast.success("Application status updated.");
      await Promise.all([
        utils.seller.workspace.invalidate(),
        utils.affiliate.workspace.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });
  const recordConversionMutation = trpc.seller.recordConversion.useMutation({
    onSuccess: async result => {
      toast.success(
        `Sale recorded; ${moneyExact(result.commissionAmount)} commission is awaiting seller review.`
      );
      setConversionApplication(null);
      setConversionForm({ orderReference: "", saleAmount: "" });
      await Promise.all([
        utils.seller.workspace.invalidate(),
        utils.affiliate.workspace.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });
  const reviewConversionMutation = trpc.seller.reviewConversion.useMutation({
    onSuccess: async () => {
      toast.success("Conversion status updated.");
      await Promise.all([
        utils.seller.workspace.invalidate(),
        utils.affiliate.workspace.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });
  const reviewVerificationMutation =
    trpc.network.reviewVerification.useMutation({
      onSuccess: async (_result, variables) => {
        toast.success(
          variables.status === "verified"
            ? "Profile verified."
            : variables.status === "more_details"
              ? "Details requested."
              : "Profile declined."
        );
        await Promise.all([
          utils.network.verificationQueue.invalidate(),
          utils.seller.workspace.invalidate(),
          utils.affiliate.workspace.invalidate(),
          utils.marketplace.list.invalidate(),
        ]);
      },
      onError: error => toast.error(error.message),
    });

  useEffect(() => {
    if (affiliateQuery.data?.profile) {
      setAffiliateForm(current => ({
        ...current,
        channels:
          current.channels || affiliateQuery.data.profile?.channels || "",
        audienceSize:
          current.audienceSize ||
          String(affiliateQuery.data.profile?.audienceSize ?? ""),
        bio: current.bio || affiliateQuery.data.profile?.bio || "",
      }));
    }
  }, [affiliateQuery.data?.profile]);

  useEffect(() => {
    if (sellerQuery.data?.organization) {
      setSellerForm({
        businessName: sellerQuery.data.organization.businessName,
        website: sellerQuery.data.organization.website ?? "",
        contactEmail:
          sellerQuery.data.organization.contactEmail ?? user?.email ?? "",
        description: sellerQuery.data.organization.description ?? "",
      });
    } else if (user?.email) {
      setSellerForm(current => ({
        ...current,
        contactEmail: current.contactEmail || user.email || "",
      }));
    }
  }, [sellerQuery.data?.organization, user?.email]);

  useEffect(() => {
    if (referralQuery.data?.destinationUrl)
      window.location.replace(referralQuery.data.destinationUrl);
  }, [referralQuery.data]);

  const offers = marketplaceQuery.data ?? [];
  const applications = affiliateQuery.data?.applications ?? [];
  const seller = sellerQuery.data?.organization;
  const sellerOffers = sellerQuery.data?.offers ?? [];
  const sellerApplications = sellerQuery.data?.applications ?? [];
  const sellerConversions = sellerQuery.data?.conversions ?? [];
  const affiliateConversions = affiliateQuery.data?.conversions ?? [];
  const pendingCount = sellerApplications.filter(
    application => application.status === "pending"
  ).length;

  function requireLogin(action: () => void) {
    if (!isAuthenticated) {
      startLogin();
      return;
    }
    action();
  }

  function openApplication(offer: MarketplaceOffer) {
    requireLogin(() => {
      const profile = affiliateQuery.data?.profile;
      setAffiliateForm(current => ({
        channels: profile?.channels ?? current.channels,
        audienceSize: profile
          ? String(profile.audienceSize)
          : current.audienceSize,
        bio: profile?.bio ?? current.bio,
        message: "",
      }));
      setApplicationOffer(offer);
    });
  }

  function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!applicationOffer) return;
    applyMutation.mutate({
      offerId: applicationOffer.id,
      channels: affiliateForm.channels,
      audienceSize: Number(affiliateForm.audienceSize || 0),
      bio: affiliateForm.bio || undefined,
      message: affiliateForm.message,
    });
  }

  function submitSellerProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    registerSellerMutation.mutate({
      ...sellerForm,
      website: sellerForm.website || undefined,
      description: sellerForm.description || undefined,
    });
  }

  function submitOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createOfferMutation.mutate({
      ...offerForm,
      price: Number(offerForm.price),
      commissionPercent: Number(offerForm.commissionPercent),
      destinationUrl: offerForm.destinationUrl || undefined,
      imageUrl: offerForm.imageUrl || undefined,
    });
  }

  function openOfferForm() {
    setOfferForm(current => ({
      ...current,
      status: seller?.verificationStatus === "verified" ? "active" : "draft",
    }));
    setOfferFormOpen(true);
  }

  function submitAffiliateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveAffiliateMutation.mutate({
      channels: affiliateForm.channels,
      audienceSize: Number(affiliateForm.audienceSize || 0),
      bio: affiliateForm.bio || undefined,
    });
  }

  function handleReview(
    applicationId: number,
    status: "approved" | "more_details" | "declined"
  ) {
    reviewMutation.mutate({
      applicationId,
      status,
      sellerNote: reviewNotes[applicationId] || undefined,
    });
  }

  function handleVerification(
    entityType: "seller" | "affiliate",
    entityId: number,
    status: "verified" | "more_details" | "rejected",
    noteText?: string
  ) {
    const note = noteText?.trim();
    if (status === "more_details" && !note) {
      toast.error("Add a note describing the details needed.");
      return;
    }
    reviewVerificationMutation.mutate({
      entityType,
      entityId,
      status,
      note: note || undefined,
    });
  }

  function copyReferralLink(code: string) {
    if (!navigator.clipboard) {
      toast.error("Clipboard access is unavailable in this browser.");
      return;
    }
    void navigator.clipboard
      .writeText(`${window.location.origin}/r/${code}`)
      .then(() => toast.success("Referral link copied."))
      .catch(() =>
        toast.error("Clipboard access is unavailable in this browser.")
      );
  }

  function submitConversion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!conversionApplication) return;
    recordConversionMutation.mutate({
      applicationId: conversionApplication.id,
      orderReference: conversionForm.orderReference,
      saleAmount: Number(conversionForm.saleAmount),
    });
  }

  function handleConversionReview(
    conversionId: number,
    status: "approved" | "rejected"
  ) {
    reviewConversionMutation.mutate({ conversionId, status });
  }

  const brand = (
    <div className="brand-lockup">
      <span className="brand-symbol">
        <img
          src="/manus-storage/onwheelz-mark-optimized_18346d0f.png"
          alt=""
          aria-hidden="true"
        />
      </span>
      <span className="brand-word">
        ONWHEELZ<span className="brand-sub">AFFILIATE NETWORK</span>
      </span>
    </div>
  );

  if (location.startsWith("/r/")) {
    return (
      <div className="referral-redirect">
        <img src="/manus-storage/onwheelz-mark-optimized_18346d0f.png" alt="" />
        <h1>
          {!referralCode || referralQuery.isError
            ? "This referral link is unavailable."
            : "Your next move is loading."}
        </h1>
        <p>
          {!referralCode || referralQuery.isError
            ? "The offer may be paused, its destination may be missing, or this partnership may have changed."
            : "Sending you to the seller’s offer…"}
        </p>
        {(!referralCode || referralQuery.isError) && (
          <button
            className="button button-dark"
            onClick={() => setView("marketplace")}
          >
            Explore the marketplace <ArrowRight size={15} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="site-shell">
      <div className="announcement">
        <span className="announcement-dot" /> THE OPEN ROAD TO NEW REVENUE{" "}
        <span className="announcement-separator">/</span> EVERY CATEGORY. ONE
        NETWORK. <ArrowUpRight size={13} />
      </div>
      <header className="site-header">
        <a className="brand-link" href="#top" aria-label="ONWHEELZ homepage">
          {brand}
        </a>
        <button
          className="mobile-menu-button"
          aria-label="Toggle navigation"
          onClick={() => setMobileMenuOpen(open => !open)}
        >
          <Menu size={21} />
        </button>
        <nav
          className={`main-nav${mobileMenuOpen ? " nav-open" : ""}`}
          aria-label="Main navigation"
        >
          <button
            className={
              view === "marketplace" ? "nav-item nav-active" : "nav-item"
            }
            onClick={() => {
              setView("marketplace");
              setMobileMenuOpen(false);
            }}
          >
            Explore offers
          </button>
          <button
            className={
              view === "affiliate" ? "nav-item nav-active" : "nav-item"
            }
            onClick={() => {
              setView("affiliate");
              setMobileMenuOpen(false);
            }}
          >
            Affiliate desk
          </button>
          <button
            className={view === "seller" ? "nav-item nav-active" : "nav-item"}
            onClick={() => {
              setView("seller");
              setMobileMenuOpen(false);
            }}
          >
            Seller studio
          </button>
          {isAuthenticated && user?.role === "admin" && (
            <button
              className={
                view === "network" ? "nav-item nav-active" : "nav-item"
              }
              onClick={() => {
                setView("network");
                setMobileMenuOpen(false);
              }}
            >
              Network desk
            </button>
          )}
        </nav>
        <div className="header-actions">
          {isAuthenticated ? (
            <>
              <span className="header-user">
                <span className="user-avatar">
                  {(user?.name || user?.email || "O").slice(0, 1).toUpperCase()}
                </span>
                <span className="header-user-name">
                  {user?.name || "Your account"}
                </span>
              </span>
              <button className="header-signin" onClick={() => void logout()}>
                Sign out
              </button>
            </>
          ) : (
            <button className="header-signin" onClick={() => startLogin()}>
              Sign in <ArrowUpRight size={15} />
            </button>
          )}
          <button className="header-cta" onClick={() => setView("seller")}>
            Partner with us <ArrowUpRight size={15} />
          </button>
        </div>
      </header>

      <main id="top">
        {view === "marketplace" && (
          <>
            <section className="hero-section">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span className="eyebrow-rule" /> INDEPENDENT AFFILIATES.
                  MOBILITY BRANDS.
                </div>
                <h1>
                  Everything
                  <br />
                  with <span>wheels.</span>
                  <br />
                  One network.
                </h1>
                <p className="hero-intro">
                  Cars. Components. Service bays. Aircraft. If it rolls, rides
                  or takes off, there’s a place for it here.
                </p>
                <div className="hero-actions">
                  <button
                    className="button button-orange"
                    onClick={() =>
                      document
                        .getElementById("opportunities")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    Find offers <ArrowRight size={17} />
                  </button>
                  <button
                    className="button button-quiet"
                    onClick={() => setView("seller")}
                  >
                    I sell mobility <ArrowUpRight size={16} />
                  </button>
                </div>
                <div className="hero-proof">
                  <span className="proof-avatars">
                    <span>A</span>
                    <span>M</span>
                    <span>R</span>
                  </span>
                  <span>Built for people who move the world forward.</span>
                </div>
              </div>
              <div className="hero-art-panel">
                <div className="hero-panel-top">
                  <span>THE MOBILITY MARKETPLACE</span>
                  <span className="hero-live">
                    <i /> OPEN FOR PARTNERS
                  </span>
                </div>
                <div className="orbit-scene" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="orbit orbit-three" />
                  <div className="wheel-core">
                    <Disc3 size={119} strokeWidth={1.15} />
                  </div>
                  <div className="orbit-tag tag-auto">
                    <CarFront size={17} />
                    <span>DRIVE</span>
                  </div>
                  <div className="orbit-tag tag-parts">
                    <Wrench size={17} />
                    <span>BUILD</span>
                  </div>
                  <div className="orbit-tag tag-flight">
                    <Plane size={17} />
                    <span>FLY</span>
                  </div>
                  <div className="wheel-spark spark-one" />
                  <div className="wheel-spark spark-two" />
                </div>
                <div className="hero-panel-bottom">
                  <div>
                    <strong>WHEELS MOVE.</strong>
                    <span>So does business.</span>
                  </div>
                  <span className="panel-arrow">
                    <ArrowUpRight size={20} />
                  </span>
                </div>
              </div>
            </section>

            <section className="signal-strip" aria-label="Network principles">
              <div className="signal-item">
                <span className="signal-icon">
                  <Compass size={17} />
                </span>
                <div>
                  <strong>One wide-open category</strong>
                  <span>Mobility, beyond the obvious</span>
                </div>
              </div>
              <div className="signal-item">
                <span className="signal-icon">
                  <Users size={17} />
                </span>
                <div>
                  <strong>Independent by design</strong>
                  <span>Choose the offers you back</span>
                </div>
              </div>
              <div className="signal-item">
                <span className="signal-icon">
                  <BadgeCheck size={17} />
                </span>
                <div>
                  <strong>Seller-reviewed access</strong>
                  <span>Every partnership starts with a request</span>
                </div>
              </div>
              <div className="signal-index">
                01 <span>/ 03</span>
              </div>
            </section>

            <section className="market-section" id="opportunities">
              <div className="section-heading-row">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-rule" /> THE MARKETPLACE
                  </div>
                  <h2>
                    Find your next <em>move.</em>
                  </h2>
                  <p>
                    Explore live offers and request access to promote the ones
                    that fit your audience.
                  </p>
                </div>
                <button
                  className="text-link"
                  onClick={() => setView("affiliate")}
                >
                  Your affiliate desk <ChevronRight size={16} />
                </button>
              </div>
              <div className="market-tools">
                <div
                  className="category-row"
                  role="tablist"
                  aria-label="Offer categories"
                >
                  {categories.map(item => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.value}
                        role="tab"
                        aria-selected={category === item.value}
                        className={`category-pill${category === item.value ? " category-selected" : ""}`}
                        onClick={() => setCategory(item.value)}
                      >
                        <Icon size={15} />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
                <div className="market-filter-actions">
                  <label className="region-filter">
                    <Globe2 size={15} aria-hidden="true" />
                    <select
                      aria-label="Filter offers by service region"
                      value={region}
                      onChange={event =>
                        setRegion(
                          event.target.value as
                            | (typeof MARKET_REGIONS)[number]
                            | "All"
                        )
                      }
                    >
                      <option value="All">All regions</option>
                      {MARKET_REGIONS.map(item => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="search-box">
                    <Search size={17} />
                    <input
                      aria-label="Search offers"
                      value={search}
                      onChange={event => setSearch(event.target.value)}
                      placeholder="Search products, services, brands"
                    />
                    <kbd>⌘ K</kbd>
                  </label>
                </div>
              </div>
              {marketplaceQuery.isLoading ? (
                <div className="market-empty">
                  <div className="loading-wheel">
                    <Disc3 size={28} />
                  </div>
                  <h3>Loading the marketplace</h3>
                  <p>Getting the wheels in motion…</p>
                </div>
              ) : offers.length ? (
                <div className="offer-grid">
                  {offers.map(offer => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      onApply={openApplication}
                    />
                  ))}
                </div>
              ) : (
                <>
                  <div
                    className="category-lookbook"
                    aria-label="Explore mobility categories"
                  >
                    {categories.slice(1).map(item => (
                      <button
                        className="lookbook-card"
                        key={item.value}
                        type="button"
                        onClick={() => setCategory(item.value)}
                      >
                        <img
                          src={categoryArtwork[item.value]}
                          alt=""
                          loading="lazy"
                        />
                        <span className="lookbook-shade" />
                        <span className="lookbook-copy">
                          <small>EXPLORE THE CATEGORY</small>
                          <strong>{item.label}</strong>
                          <ArrowUpRight size={17} />
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="market-empty">
                    <div className="empty-wheel">
                      <Disc3 size={32} />
                    </div>
                    <div className="eyebrow">
                      <span className="eyebrow-rule" /> FIRST LAP
                    </div>
                    <h3>
                      {search || category !== "All" || region !== "All"
                        ? "No offers match that search."
                        : "The first offers are waiting to roll in."}
                    </h3>
                    <p>
                      {search || category !== "All" || region !== "All"
                        ? "Try another category or search term."
                        : "ONWHEELZ is open for sellers. List a vehicle, a part, a service, an aircraft—or anything else on wheels."}
                    </p>
                    <button
                      className="button button-dark"
                      onClick={() => setView("seller")}
                    >
                      Open seller studio <ArrowRight size={16} />
                    </button>
                  </div>
                </>
              )}
              <div className="market-note">
                <span>
                  <Disc3 size={16} /> ONWHEELZ means mobility in every
                  direction.
                </span>
                <span>
                  Offer owners review each affiliate request directly.
                </span>
              </div>
            </section>

            <section className="partner-banner">
              <div className="banner-index">
                02 <span>/ PARTNER</span>
              </div>
              <div className="banner-copy">
                <div className="eyebrow eyebrow-light">
                  <span className="eyebrow-rule" /> BUILT FOR THE WHOLE
                  ECOSYSTEM
                </div>
                <h2>
                  Your audience.
                  <br />
                  <em>Your lane.</em>
                </h2>
                <p>
                  Join as an independent affiliate, or bring your products and
                  services to a new network of mobility-minded promoters.
                </p>
              </div>
              <div className="banner-actions">
                <button
                  className="button button-orange"
                  onClick={() => requireLogin(() => setView("affiliate"))}
                >
                  I’m an affiliate <ArrowUpRight size={16} />
                </button>
                <button
                  className="button button-outline-light"
                  onClick={() => setView("seller")}
                >
                  I’m a seller <ArrowUpRight size={16} />
                </button>
                <span>No exclusivity. No category walls.</span>
              </div>
              <div className="banner-wheel" aria-hidden="true">
                <Disc3 size={182} strokeWidth={0.6} />
              </div>
            </section>
          </>
        )}

        {view === "affiliate" && (
          <section className="workspace-section">
            <div className="workspace-topline">
              <span className="eyebrow">
                <span className="eyebrow-rule" /> YOUR ONWHEELZ ACCOUNT
              </span>
              <span className="workspace-crumb">NETWORK / AFFILIATE DESK</span>
            </div>
            <div className="workspace-heading">
              <div>
                <h1>
                  Affiliate <em>desk.</em>
                </h1>
                <p>
                  Find offers that fit your audience, then send a request
                  straight to the seller.
                </p>
              </div>
              <button
                className="button button-orange"
                onClick={() => {
                  setView("marketplace");
                  document
                    .getElementById("opportunities")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Explore offers <ArrowRight size={16} />
              </button>
            </div>
            {!isAuthenticated ? (
              <div className="workspace-gate">
                <div className="gate-icon">
                  <Users size={22} />
                </div>
                <h2>Sign in to start your affiliate profile.</h2>
                <p>
                  Use your ONWHEELZ account to save your channels and track each
                  seller’s decision.
                </p>
                <button
                  className="button button-dark"
                  onClick={() => startLogin()}
                >
                  Sign in or create account <ArrowUpRight size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className="stats-grid">
                  <div className="stat-card">
                    <span>REQUESTS SENT</span>
                    <strong>
                      {applications.length.toString().padStart(2, "0")}
                    </strong>
                    <small>Across your offer shortlist</small>
                  </div>
                  <div className="stat-card">
                    <span>AWAITING REVIEW</span>
                    <strong>
                      {applications
                        .filter(application => application.status === "pending")
                        .length.toString()
                        .padStart(2, "0")}
                    </strong>
                    <small>Seller decisions in progress</small>
                  </div>
                  <div className="stat-card stat-card-accent">
                    <span>APPROVED TO PROMOTE</span>
                    <strong>
                      {applications
                        .filter(
                          application => application.status === "approved"
                        )
                        .length.toString()
                        .padStart(2, "0")}
                    </strong>
                    <small>Offers you can move forward with</small>
                  </div>
                </div>
                <div className="workspace-grid">
                  <section className="workspace-card profile-card">
                    <div className="card-kicker">
                      <span className="kicker-icon">
                        <Instagram size={16} />
                      </span>
                      <span>AFFILIATE PROFILE</span>
                    </div>
                    <h2>Where do you move people?</h2>
                    <p>
                      Add your channels and audience reach once—then use them
                      for every application.
                    </p>
                    {affiliateQuery.data?.profile && (
                      <div className="profile-verification-note">
                        <StatusPill
                          status={
                            affiliateQuery.data.profile.verificationStatus
                          }
                        />
                        <span>
                          {affiliateQuery.data.profile.verificationNote ||
                            "ONWHEELZ reviews public channels and profile details before marking an affiliate verified."}
                        </span>
                      </div>
                    )}
                    <form
                      className="stack-form"
                      onSubmit={submitAffiliateProfile}
                    >
                      <Field label="Channels & platforms">
                        <input
                          required
                          className="field-input"
                          value={affiliateForm.channels}
                          onChange={event =>
                            setAffiliateForm({
                              ...affiliateForm,
                              channels: event.target.value,
                            })
                          }
                          placeholder="Instagram, YouTube, newsletter…"
                        />
                      </Field>
                      <Field label="Audience reach">
                        <input
                          className="field-input"
                          type="number"
                          min="0"
                          value={affiliateForm.audienceSize}
                          onChange={event =>
                            setAffiliateForm({
                              ...affiliateForm,
                              audienceSize: event.target.value,
                            })
                          }
                          placeholder="Total followers / subscribers"
                        />
                      </Field>
                      <Field label="A little about your audience">
                        <textarea
                          className="field-input field-textarea"
                          rows={3}
                          value={affiliateForm.bio}
                          onChange={event =>
                            setAffiliateForm({
                              ...affiliateForm,
                              bio: event.target.value,
                            })
                          }
                          placeholder="Who follows you, and what are they looking for?"
                        />
                      </Field>
                      <button
                        className="button button-dark"
                        type="submit"
                        disabled={saveAffiliateMutation.isPending}
                      >
                        {saveAffiliateMutation.isPending
                          ? "Saving…"
                          : "Save affiliate profile"}
                        <ArrowUpRight size={15} />
                      </button>
                    </form>
                  </section>
                  <section className="workspace-card applications-card">
                    <div className="card-kicker">
                      <span className="kicker-icon">
                        <Clock3 size={16} />
                      </span>
                      <span>YOUR REQUESTS</span>
                    </div>
                    <div className="card-title-row">
                      <h2>Applications</h2>
                      <span className="count-badge">{applications.length}</span>
                    </div>
                    {affiliateQuery.isLoading ? (
                      <div className="small-empty">
                        Loading your applications…
                      </div>
                    ) : applications.length === 0 ? (
                      <div className="small-empty">
                        <div className="small-empty-icon">
                          <Disc3 size={24} />
                        </div>
                        <h3>Your next partnership starts here.</h3>
                        <p>
                          Browse the marketplace and request approval to promote
                          an offer.
                        </p>
                        <button
                          className="text-link"
                          onClick={() => setView("marketplace")}
                        >
                          Explore live offers <ArrowRight size={15} />
                        </button>
                      </div>
                    ) : (
                      <div className="application-list">
                        {applications.map(application => (
                          <article
                            className="application-row"
                            key={application.id}
                          >
                            <div className="application-main">
                              <div className="application-identity">
                                <span className="application-brand-icon">
                                  <Disc3 size={17} />
                                </span>
                                <div>
                                  <strong>{application.title}</strong>
                                  <span>
                                    {application.companyName} ·{" "}
                                    {application.category}
                                  </span>
                                </div>
                              </div>
                              <StatusPill status={application.status} />
                            </div>
                            <p className="application-message">
                              “{application.message}”
                            </p>
                            {application.sellerNote && (
                              <div className="seller-note">
                                <strong>Seller note</strong>
                                <span>{application.sellerNote}</span>
                              </div>
                            )}
                            <div className="application-foot">
                              <span>
                                Requested {shortDate(application.createdAt)}
                              </span>
                              <span>
                                {Number(application.commissionPercent)}%
                                commission
                              </span>
                            </div>
                            {application.status === "more_details" && (
                              <button
                                className="text-link reapply-link"
                                onClick={() => setView("marketplace")}
                              >
                                Update details and reapply{" "}
                                <ArrowRight size={14} />
                              </button>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </>
            )}
          </section>
        )}

        {view === "affiliate" && isAuthenticated && (
          <div className="extension-panels-wrap">
            {affiliateQuery.data?.profile ? (
              <AffiliatePayPalSettingsPanel
                hasRecipient={affiliateQuery.data.profile.hasPayPalRecipient}
              />
            ) : (
              <section className="workspace-card paypal-recipient-card">
                <div className="card-kicker">
                  <span className="kicker-icon"><CircleDollarSign size={16} /></span>
                  <span>PAYPAL PAYOUT PREFERENCE</span>
                </div>
                <h2>Save your affiliate profile first.</h2>
                <p>ONWHEELZ can store a PayPal recipient only after you have saved your affiliate channels and profile details.</p>
              </section>
            )}
            <AffiliateAttributionPanel
              applications={applications}
              conversions={affiliateConversions}
              onCopy={copyReferralLink}
            />
          </div>
        )}

        {view === "seller" && (
          <section className="workspace-section seller-workspace">
            <div className="workspace-topline">
              <span className="eyebrow">
                <span className="eyebrow-rule" /> SELLER PARTNER AREA
              </span>
              <span className="workspace-crumb">NETWORK / SELLER STUDIO</span>
            </div>
            <div className="workspace-heading">
              <div>
                <h1>
                  Seller <em>studio.</em>
                </h1>
                <p>
                  Bring your mobility offer to independent affiliates who know
                  their audiences.
                </p>
              </div>
              {seller && (
                <button
                  className="button button-orange"
                  onClick={openOfferForm}
                >
                  <Plus size={17} /> Add an offer
                </button>
              )}
            </div>
            {!isAuthenticated ? (
              <div className="workspace-gate">
                <div className="gate-icon">
                  <Store size={22} />
                </div>
                <h2>Sign in to create your seller space.</h2>
                <p>
                  Set up your company, publish an offer, and review affiliate
                  requests in one place.
                </p>
                <button
                  className="button button-dark"
                  onClick={() => startLogin()}
                >
                  Sign in or create account <ArrowUpRight size={16} />
                </button>
              </div>
            ) : (
              <>
                {!seller && (
                  <div className="seller-onboard-layout">
                    <div className="seller-onboard-copy">
                      <span className="onboard-number">01 / YOUR BUSINESS</span>
                      <h2>
                        Put your offer
                        <br />
                        in motion.
                      </h2>
                      <p>
                        Tell us a little about your company or independent shop.
                        ONWHEELZ reviews seller profiles before offers go live;
                        you can prepare drafts while your business is reviewed.
                      </p>
                      <div className="onboard-perk">
                        <Check size={16} />
                        <span>
                          Reach independent promoters across the mobility world
                        </span>
                      </div>
                      <div className="onboard-perk">
                        <Check size={16} />
                        <span>Choose your own commission for every offer</span>
                      </div>
                      <div className="onboard-perk">
                        <Check size={16} />
                        <span>Review each affiliate request on your terms</span>
                      </div>
                    </div>
                    <form
                      className="workspace-card seller-profile-form"
                      onSubmit={submitSellerProfile}
                    >
                      <div className="card-kicker">
                        <span className="kicker-icon">
                          <Store size={16} />
                        </span>
                        <span>CREATE SELLER SPACE</span>
                      </div>
                      <h2>Business details</h2>
                      <Field label="Business or seller name">
                        <input
                          required
                          className="field-input"
                          value={sellerForm.businessName}
                          onChange={event =>
                            setSellerForm({
                              ...sellerForm,
                              businessName: event.target.value,
                            })
                          }
                          placeholder="e.g. Northline Mobility"
                        />
                      </Field>
                      <div className="form-two-col">
                        <Field label="Contact email">
                          <input
                            required
                            type="email"
                            className="field-input"
                            value={sellerForm.contactEmail}
                            onChange={event =>
                              setSellerForm({
                                ...sellerForm,
                                contactEmail: event.target.value,
                              })
                            }
                            placeholder="you@company.com"
                          />
                        </Field>
                        <Field label="Website (optional)">
                          <input
                            className="field-input"
                            value={sellerForm.website}
                            onChange={event =>
                              setSellerForm({
                                ...sellerForm,
                                website: event.target.value,
                              })
                            }
                            placeholder="https://"
                          />
                        </Field>
                      </div>
                      <Field label="What do you sell?">
                        <textarea
                          className="field-input field-textarea"
                          rows={4}
                          value={sellerForm.description}
                          onChange={event =>
                            setSellerForm({
                              ...sellerForm,
                              description: event.target.value,
                            })
                          }
                          placeholder="Tell affiliates what makes your products or services worth sharing."
                        />
                      </Field>
                      <button
                        className="button button-orange button-full"
                        type="submit"
                        disabled={registerSellerMutation.isPending}
                      >
                        {registerSellerMutation.isPending
                          ? "Creating seller space…"
                          : "Create seller space"}
                        <ArrowRight size={16} />
                      </button>
                      <span className="form-footnote">
                        Your details stay in your seller workspace.
                      </span>
                    </form>
                  </div>
                )}
                {seller && (
                  <>
                    <div className="seller-welcome">
                      <div className="seller-welcome-icon">
                        <Store size={22} />
                      </div>
                      <div>
                        <span>YOUR SELLER SPACE</span>
                        <h2>{seller.businessName}</h2>
                        <p>
                          {seller.website || seller.contactEmail} <span>·</span>{" "}
                          {seller.verificationStatus === "verified"
                            ? "Verified ONWHEELZ partner. Offers can go live."
                            : seller.verificationStatus === "more_details"
                              ? `Details requested${seller.verificationNote ? `: ${seller.verificationNote}` : ". Update your profile and save to resubmit."}`
                              : seller.verificationStatus === "rejected"
                                ? `Profile needs an update${seller.verificationNote ? `: ${seller.verificationNote}` : ". Edit your details and save to resubmit."}`
                                : "Profile in review. You can prepare offers as drafts."}
                        </p>
                      </div>
                      <button
                        className="seller-edit-button"
                        onClick={() =>
                          document
                            .getElementById("seller-profile-edit")
                            ?.scrollIntoView({ behavior: "smooth" })
                        }
                      >
                        Edit profile <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <div className="stats-grid seller-stats">
                      <div className="stat-card">
                        <span>LIVE OFFERS</span>
                        <strong>
                          {sellerOffers
                            .filter(offer => offer.status === "active")
                            .length.toString()
                            .padStart(2, "0")}
                        </strong>
                        <small>Available in the marketplace</small>
                      </div>
                      <div className="stat-card">
                        <span>ALL APPLICATIONS</span>
                        <strong>
                          {sellerApplications.length
                            .toString()
                            .padStart(2, "0")}
                        </strong>
                        <small>From independent affiliates</small>
                      </div>
                      <div className="stat-card stat-card-accent">
                        <span>NEEDS YOUR REVIEW</span>
                        <strong>
                          {pendingCount.toString().padStart(2, "0")}
                        </strong>
                        <small>Awaiting a seller decision</small>
                      </div>
                    </div>
                    <div className="workspace-grid seller-grid">
                      <section className="workspace-card listings-card">
                        <div className="card-kicker">
                          <span className="kicker-icon">
                            <Package size={16} />
                          </span>
                          <span>YOUR CATALOG</span>
                        </div>
                        <div className="card-title-row">
                          <h2>Offers</h2>
                          <button
                            className="small-add-button"
                            onClick={openOfferForm}
                          >
                            <Plus size={15} /> Add offer
                          </button>
                        </div>
                        {sellerOffers.length === 0 ? (
                          <div className="small-empty">
                            <div className="small-empty-icon">
                              <Disc3 size={24} />
                            </div>
                            <h3>Start with your first offer.</h3>
                            <p>
                              Add a vehicle, a component, a service, an aircraft
                              or any other wheeled product.
                            </p>
                            <button
                              className="button button-dark"
                              onClick={openOfferForm}
                            >
                              Create an offer <ArrowRight size={15} />
                            </button>
                          </div>
                        ) : (
                          <div className="seller-offer-list">
                            {sellerOffers.map(offer => (
                              <div className="seller-offer-row" key={offer.id}>
                                <div className="seller-offer-art">
                                  <img
                                    src={
                                      offer.imageUrl ||
                                      categoryArtwork[offer.category]
                                    }
                                    alt=""
                                    loading="lazy"
                                    onError={event => {
                                      event.currentTarget.style.display =
                                        "none";
                                    }}
                                  />
                                  <Disc3 size={19} />
                                </div>
                                <div className="seller-offer-main">
                                  <strong>{offer.title}</strong>
                                  <span>
                                    {offer.category} · {offer.region} ·{" "}
                                    {money(offer.price, offer.currency)} ·{" "}
                                    {Number(offer.commissionPercent)}%
                                    commission
                                  </span>
                                </div>
                                <StatusPill status={offer.status} />
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                      <section className="workspace-card review-card">
                        <div className="card-kicker">
                          <span className="kicker-icon">
                            <Users size={16} />
                          </span>
                          <span>AFFILIATE REVIEW QUEUE</span>
                        </div>
                        <div className="card-title-row">
                          <h2>Applications</h2>
                          <span className="count-badge">
                            {pendingCount} pending
                          </span>
                        </div>
                        {sellerApplications.length === 0 ? (
                          <div className="small-empty">
                            <div className="small-empty-icon">
                              <BadgeCheck size={23} />
                            </div>
                            <h3>Your approval queue is clear.</h3>
                            <p>
                              When an affiliate requests one of your offers,
                              their profile and message will appear here.
                            </p>
                          </div>
                        ) : (
                          <div className="review-list">
                            {sellerApplications.map(application => (
                              <article
                                className="review-item"
                                key={application.id}
                              >
                                <div className="review-applicant">
                                  <span className="affiliate-avatar">
                                    {(
                                      application.affiliateName ||
                                      application.affiliateEmail ||
                                      "A"
                                    )
                                      .slice(0, 1)
                                      .toUpperCase()}
                                  </span>
                                  <div>
                                    <strong>
                                      {application.affiliateName ||
                                        "ONWHEELZ affiliate"}
                                    </strong>
                                    <span>
                                      {application.channels ||
                                        "Channels not added"}{" "}
                                      ·{" "}
                                      {Number(
                                        application.audienceSize ?? 0
                                      ).toLocaleString()}{" "}
                                      reach ·{" "}
                                      {application.affiliateVerificationStatus ===
                                      "verified"
                                        ? "ONWHEELZ verified"
                                        : "profile not verified"}
                                    </span>
                                  </div>
                                  <StatusPill status={application.status} />
                                </div>
                                <div className="review-offer-label">
                                  REQUESTED FOR{" "}
                                  <strong>{application.title}</strong>
                                </div>
                                <p className="application-message">
                                  “{application.message}”
                                </p>
                                {application.affiliateEmail && (
                                  <span className="contact-line">
                                    <Globe2 size={14} />{" "}
                                    {application.affiliateEmail}
                                  </span>
                                )}
                                {application.sellerNote && (
                                  <div className="seller-note">
                                    <strong>Previous note</strong>
                                    <span>{application.sellerNote}</span>
                                  </div>
                                )}
                                {application.status !== "approved" &&
                                  application.status !== "declined" && (
                                    <>
                                      <textarea
                                        className="field-input review-note-input"
                                        rows={2}
                                        value={
                                          reviewNotes[application.id] ?? ""
                                        }
                                        onChange={event =>
                                          setReviewNotes({
                                            ...reviewNotes,
                                            [application.id]:
                                              event.target.value,
                                          })
                                        }
                                        placeholder="Optional note to the affiliate…"
                                      />
                                      <div className="review-actions">
                                        <button
                                          className="review-button review-approve"
                                          onClick={() =>
                                            handleReview(
                                              application.id,
                                              "approved"
                                            )
                                          }
                                          disabled={reviewMutation.isPending}
                                        >
                                          <Check size={14} /> Approve
                                        </button>
                                        <button
                                          className="review-button review-more"
                                          onClick={() =>
                                            handleReview(
                                              application.id,
                                              "more_details"
                                            )
                                          }
                                          disabled={reviewMutation.isPending}
                                        >
                                          <Clock3 size={14} /> Need details
                                        </button>
                                        <button
                                          className="review-button review-decline"
                                          onClick={() =>
                                            handleReview(
                                              application.id,
                                              "declined"
                                            )
                                          }
                                          disabled={reviewMutation.isPending}
                                        >
                                          <X size={14} /> Decline
                                        </button>
                                      </div>
                                    </>
                                  )}
                              </article>
                            ))}
                          </div>
                        )}
                      </section>
                    </div>
                    <section
                      id="seller-profile-edit"
                      className="workspace-card edit-profile-card"
                    >
                      <div className="card-kicker">
                        <span className="kicker-icon">
                          <Store size={16} />
                        </span>
                        <span>SELLER DETAILS</span>
                      </div>
                      <form
                        className="seller-edit-form"
                        onSubmit={submitSellerProfile}
                      >
                        <Field label="Business name">
                          <input
                            required
                            className="field-input"
                            value={sellerForm.businessName}
                            onChange={event =>
                              setSellerForm({
                                ...sellerForm,
                                businessName: event.target.value,
                              })
                            }
                          />
                        </Field>
                        <Field label="Contact email">
                          <input
                            required
                            type="email"
                            className="field-input"
                            value={sellerForm.contactEmail}
                            onChange={event =>
                              setSellerForm({
                                ...sellerForm,
                                contactEmail: event.target.value,
                              })
                            }
                          />
                        </Field>
                        <Field label="Website">
                          <input
                            className="field-input"
                            value={sellerForm.website}
                            onChange={event =>
                              setSellerForm({
                                ...sellerForm,
                                website: event.target.value,
                              })
                            }
                            placeholder="https://"
                          />
                        </Field>
                        <button
                          className="button button-dark"
                          type="submit"
                          disabled={registerSellerMutation.isPending}
                        >
                          Save seller details <Check size={15} />
                        </button>
                      </form>
                    </section>
                  </>
                )}
              </>
            )}
          </section>
        )}
        {view === "seller" && isAuthenticated && seller && (
          <div className="extension-panels-wrap seller-ledger-wrap">
            <SellerWebhookPanel
              sellerId={seller.id}
              applications={sellerApplications}
              integration={sellerQuery.data?.webhookIntegration ?? null}
            />
            <SellerConversionPanel
              applications={sellerApplications}
              conversions={sellerConversions}
              onRecord={application => {
                setConversionApplication({
                  id: application.id,
                  title: application.title,
                  affiliateName: application.affiliateName,
                  commissionPercent: application.commissionPercent,
                });
                setConversionForm({ orderReference: "", saleAmount: "" });
              }}
              onReview={handleConversionReview}
              isReviewing={reviewConversionMutation.isPending}
            />
          </div>
        )}
        {view === "network" && (
          <>
            <NetworkVerificationDesk
              data={networkQuery.data}
              isLoading={networkQuery.isLoading}
              isAuthenticated={isAuthenticated}
              isAdmin={user?.role === "admin"}
              isSaving={reviewVerificationMutation.isPending}
              onReview={handleVerification}
            />
            {isAuthenticated && user?.role === "admin" && (
              <div className="extension-panels-wrap network-payout-wrap">
                <PayPalPayoutAdminPanel />
              </div>
            )}
          </>
        )}
      </main>

      <footer className="site-footer">
        <a className="brand-link" href="#top">
          {brand}
        </a>
        <span>ONWHEELZ · A wider road for mobility commerce.</span>
        <div className="footer-links">
          <button onClick={() => setView("marketplace")}>Marketplace</button>
          <button onClick={() => setView("affiliate")}>Affiliates</button>
          <button onClick={() => setView("seller")}>Sellers</button>
          <span>© {new Date().getFullYear()} ONWHEELZ</span>
        </div>
      </footer>

      {applicationOffer && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setApplicationOffer(null);
          }}
        >
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="apply-title"
          >
            <button
              className="modal-close"
              aria-label="Close"
              onClick={() => setApplicationOffer(null)}
            >
              <X size={19} />
            </button>
            <div className="modal-kicker">
              <span className="eyebrow-rule" /> AFFILIATE REQUEST
            </div>
            <h2 id="apply-title">Put in a good word.</h2>
            <p className="modal-intro">
              Request approval to promote{" "}
              <strong>{applicationOffer.title}</strong> by{" "}
              <strong>{applicationOffer.companyName}</strong>.
            </p>
            <div className="modal-commission">
              <CircleDollarSign size={17} />
              <span>
                <strong>{Number(applicationOffer.commissionPercent)}%</strong>{" "}
                commission offered
              </span>
            </div>
            <form className="stack-form" onSubmit={submitApplication}>
              <Field label="Your channels">
                <input
                  className="field-input"
                  required
                  value={affiliateForm.channels}
                  onChange={event =>
                    setAffiliateForm({
                      ...affiliateForm,
                      channels: event.target.value,
                    })
                  }
                  placeholder="Instagram, YouTube, newsletter…"
                />
              </Field>
              <Field label="Audience reach">
                <input
                  className="field-input"
                  type="number"
                  min="0"
                  value={affiliateForm.audienceSize}
                  onChange={event =>
                    setAffiliateForm({
                      ...affiliateForm,
                      audienceSize: event.target.value,
                    })
                  }
                  placeholder="Total followers / subscribers"
                />
              </Field>
              <Field label="Why is this a fit for your audience?">
                <textarea
                  className="field-input field-textarea"
                  rows={4}
                  minLength={20}
                  required
                  value={affiliateForm.message}
                  onChange={event =>
                    setAffiliateForm({
                      ...affiliateForm,
                      message: event.target.value,
                    })
                  }
                  placeholder="Share how you’d introduce this offer to your community (at least 20 characters)."
                />
              </Field>
              <Field label="About your audience (optional)">
                <textarea
                  className="field-input field-textarea"
                  rows={2}
                  value={affiliateForm.bio}
                  onChange={event =>
                    setAffiliateForm({
                      ...affiliateForm,
                      bio: event.target.value,
                    })
                  }
                  placeholder="A little context for the seller…"
                />
              </Field>
              <button
                className="button button-orange button-full"
                type="submit"
                disabled={applyMutation.isPending}
              >
                {applyMutation.isPending
                  ? "Sending request…"
                  : "Send promotion request"}
                <ArrowRight size={16} />
              </button>
              <span className="form-footnote">
                The seller will review your request and can approve, request
                details or decline.
              </span>
            </form>
          </section>
        </div>
      )}

      {conversionApplication && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget)
              setConversionApplication(null);
          }}
        >
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="conversion-title"
          >
            <button
              className="modal-close"
              aria-label="Close"
              onClick={() => setConversionApplication(null)}
            >
              <X size={19} />
            </button>
            <div className="modal-kicker">
              <span className="eyebrow-rule" /> SELLER-REPORTED SALE
            </div>
            <h2 id="conversion-title">Record a conversion.</h2>
            <p className="modal-intro">
              Report a completed order for{" "}
              <strong>
                {conversionApplication.affiliateName || "your affiliate"}
              </strong>{" "}
              on <strong>{conversionApplication.title}</strong>. The affiliate
              commission is calculated from the approved partnership rate and
              remains pending your review.
            </p>
            <div className="modal-commission">
              <CircleDollarSign size={17} />
              <span>
                <strong>{conversionApplication.commissionPercent}%</strong>{" "}
                commission rate
              </span>
            </div>
            <form className="stack-form" onSubmit={submitConversion}>
              <Field label="Order reference">
                <input
                  className="field-input"
                  required
                  minLength={2}
                  maxLength={120}
                  value={conversionForm.orderReference}
                  onChange={event =>
                    setConversionForm({
                      ...conversionForm,
                      orderReference: event.target.value,
                    })
                  }
                  placeholder="Your order or invoice number"
                />
              </Field>
              <Field label="Sale amount (USD)">
                <input
                  className="field-input"
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={conversionForm.saleAmount}
                  onChange={event =>
                    setConversionForm({
                      ...conversionForm,
                      saleAmount: event.target.value,
                    })
                  }
                  placeholder="249.00"
                />
              </Field>
              <div className="conversion-estimate">
                Estimated commission{" "}
                <strong>
                  {moneyExact(
                    (Number(conversionForm.saleAmount || 0) *
                      Number(conversionApplication.commissionPercent)) /
                      100
                  )}
                </strong>
              </div>
              <button
                className="button button-orange button-full"
                type="submit"
                disabled={recordConversionMutation.isPending}
              >
                {recordConversionMutation.isPending
                  ? "Recording sale…"
                  : "Record sale for review"}
                <ArrowRight size={16} />
              </button>
              <span className="form-footnote">
                This records a commission estimate only. It does not charge a
                customer or transfer money.
              </span>
            </form>
          </section>
        </div>
      )}

      {offerFormOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setOfferFormOpen(false);
          }}
        >
          <section
            className="modal-panel offer-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="offer-title"
          >
            <button
              className="modal-close"
              aria-label="Close"
              onClick={() => setOfferFormOpen(false)}
            >
              <X size={19} />
            </button>
            <div className="modal-kicker">
              <span className="eyebrow-rule" /> SELLER STUDIO
            </div>
            <h2 id="offer-title">Add a new offer.</h2>
            <p className="modal-intro">
              Prepare a product or service for affiliates to discover. Only
              verified sellers can publish a live offer; referral tracking
              requires an HTTP(S) destination.
            </p>
            <form className="stack-form" onSubmit={submitOffer}>
              <Field label="Offer title">
                <input
                  className="field-input"
                  required
                  minLength={3}
                  value={offerForm.title}
                  onChange={event =>
                    setOfferForm({ ...offerForm, title: event.target.value })
                  }
                  placeholder="e.g. Touring EV package"
                />
              </Field>
              <div className="form-two-col">
                <Field label="Category">
                  <select
                    className="field-input"
                    value={offerForm.category}
                    onChange={event =>
                      setOfferForm({
                        ...offerForm,
                        category: event.target.value,
                      })
                    }
                  >
                    {categories.slice(1).map(item => (
                      <option key={item.value} value={item.value}>
                        {item.value}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Price (USD)">
                  <input
                    className="field-input"
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={offerForm.price}
                    onChange={event =>
                      setOfferForm({ ...offerForm, price: event.target.value })
                    }
                    placeholder="249"
                  />
                </Field>
              </div>
              <Field label="Service region">
                <select
                  className="field-input"
                  value={offerForm.region}
                  onChange={event =>
                    setOfferForm({
                      ...offerForm,
                      region: event.target
                        .value as (typeof MARKET_REGIONS)[number],
                    })
                  }
                >
                  {MARKET_REGIONS.map(item => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="form-two-col">
                <Field label="Affiliate commission (%)">
                  <input
                    className="field-input"
                    required
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={offerForm.commissionPercent}
                    onChange={event =>
                      setOfferForm({
                        ...offerForm,
                        commissionPercent: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Publish status">
                  <select
                    className="field-input"
                    value={offerForm.status}
                    onChange={event =>
                      setOfferForm({
                        ...offerForm,
                        status: event.target.value as "active" | "draft",
                      })
                    }
                  >
                    <option
                      value="active"
                      disabled={seller?.verificationStatus !== "verified"}
                    >
                      Live in marketplace
                    </option>
                    <option value="draft">Save as draft</option>
                  </select>
                </Field>
              </div>
              <Field label="Description">
                <textarea
                  className="field-input field-textarea"
                  rows={4}
                  required
                  minLength={10}
                  value={offerForm.description}
                  onChange={event =>
                    setOfferForm({
                      ...offerForm,
                      description: event.target.value,
                    })
                  }
                  placeholder="What should affiliates know about this offer?"
                />
              </Field>
              <Field
                label={
                  offerForm.status === "active"
                    ? "Destination URL (required to publish)"
                    : "Destination URL (optional for drafts)"
                }
              >
                <input
                  className="field-input"
                  type="url"
                  required={offerForm.status === "active"}
                  value={offerForm.destinationUrl}
                  onChange={event =>
                    setOfferForm({
                      ...offerForm,
                      destinationUrl: event.target.value,
                    })
                  }
                  placeholder="https://your-shop.com/offer"
                />
              </Field>
              <Field label="Product image URL (optional)">
                <input
                  className="field-input"
                  type="url"
                  value={offerForm.imageUrl}
                  onChange={event =>
                    setOfferForm({ ...offerForm, imageUrl: event.target.value })
                  }
                  placeholder="https://your-shop.com/product.jpg"
                />
              </Field>
              <div className="offer-form-preview">
                <span>CATALOG PREVIEW</span>
                <img
                  src={
                    offerForm.imageUrl || categoryArtwork[offerForm.category]
                  }
                  alt={`${offerForm.title || offerForm.category} catalog preview`}
                  loading="lazy"
                  onError={event => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              </div>
              <button
                className="button button-orange button-full"
                type="submit"
                disabled={createOfferMutation.isPending}
              >
                {createOfferMutation.isPending
                  ? "Saving offer…"
                  : "Add offer to ONWHEELZ"}
                <ArrowRight size={16} />
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
