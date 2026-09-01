import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

export interface Brand {
  app_title: string;
  app_tagline: string;
  has_logo: boolean;
  logo_url: string | null;
}

const DEFAULT_BRAND: Brand = {
  app_title: "TapeReviewer",
  app_tagline: "Review the tape. Keep the edge.",
  has_logo: false,
  logo_url: null,
};

const BrandContext = createContext<{
  brand: Brand;
  refreshBrand: () => Promise<void>;
  setBrand: (brand: Brand) => void;
}>({
  brand: DEFAULT_BRAND,
  refreshBrand: async () => {},
  setBrand: () => {},
});

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<Brand>(DEFAULT_BRAND);

  const refreshBrand = useCallback(async () => {
    try {
      const res = await api.settings();
      if (res.brand) {
        setBrand({
          app_title: res.brand.app_title || "TapeReviewer",
          app_tagline: res.brand.app_tagline || DEFAULT_BRAND.app_tagline,
          has_logo: !!res.brand.has_logo,
          logo_url: res.brand.logo_url,
        });
        document.title = res.brand.app_title || "TapeReviewer";
      }
    } catch {
      /* ignore — AuthGate / offline */
    }
  }, []);

  useEffect(() => {
    refreshBrand();
  }, [refreshBrand]);

  return (
    <BrandContext.Provider value={{ brand, refreshBrand, setBrand }}>{children}</BrandContext.Provider>
  );
}

export function useBrand() {
  return useContext(BrandContext);
}

export function BrandMark({
  className = "",
  showTagline = false,
  size = "md",
  onClick,
}: {
  className?: string;
  showTagline?: boolean;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
}) {
  const { brand } = useBrand();
  const height = size === "lg" ? "h-12" : size === "sm" ? "h-7" : "h-9";
  const textSize = size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-2xl";
  // bust cache when logo changes
  const src = brand.logo_url ? `${brand.logo_url}?v=${encodeURIComponent(brand.app_title)}` : null;

  const inner = (
    <>
      {src ? (
        <img
          src={src}
          alt={brand.app_title}
          className={`${height} w-auto max-w-[180px] object-contain object-left`}
        />
      ) : (
        <span className={`font-display font-bold tracking-tight ${textSize}`} style={{ fontWeight: 800 }}>
          {brand.app_title}
        </span>
      )}
      {showTagline && brand.app_tagline && (
        <p className="mt-1 text-xs text-white/45">{brand.app_tagline}</p>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`text-left ${className}`}>
        {inner}
      </button>
    );
  }
  return <div className={className}>{inner}</div>;
}
