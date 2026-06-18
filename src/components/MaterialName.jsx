import { MATERIAL_SOURCES } from '../data/materials';

// A material/item name that becomes a tappable source-popup trigger when source
// data exists for it, and renders as plain text otherwise. Replaces the
// identical `mat-source-trigger` button markup duplicated across StashTab,
// CraftTab, and CampaignTab. `className` is the caller's text style (e.g.
// `stash-row-name`); `children` overrides the displayed content when it needs
// more than the bare name (e.g. CraftTab's speaking-stone tag).
export function MaterialName({ item, className, onShowSource, children }) {
  const content = children ?? item;
  if (onShowSource && MATERIAL_SOURCES[item]) {
    return (
      <button
        type="button"
        className={`${className} mat-source-trigger`}
        onClick={() => onShowSource(item)}
        aria-label={`View sources for ${item}`}
      >
        {content}
      </button>
    );
  }
  return <span className={className}>{content}</span>;
}
