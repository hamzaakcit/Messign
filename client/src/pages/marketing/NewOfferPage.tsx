import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Input } from '@/components/ui/Input';
import { ROUTES } from '@/lib/routes';
import { marketingAPI } from '@/lib/marketingApi';
import { useAuthStore } from '@/stores/authStore';
import { ViewportWrapper } from '@/pages/marketing/components/bento/ViewportWrapper';
import { ContentTenantSwitch } from '@/pages/marketing/components/ContentTenantSwitch';
import { useContentTenant } from '@/pages/marketing/lib/contentTenant';
import { createInstagramOfferPair } from '@/pages/marketing/lib/createInstagramOfferPair';
import { NEW_OFFER_STEPS, productDropNeedsProduct, type NewOfferStep } from '@/pages/marketing/lib/newOfferSteps';
import { planRecipeChildren, type OfferRecipe } from '@/pages/marketing/lib/offerRecipes';
import {
  fixtureTruthId,
  offerSceneSentence,
  priceAndPlace,
  serializeStudioBrief,
  STILL_LOOKS,
} from '@/pages/marketing/lib/offerSheetForm';
import { useMarketingContext } from './MarketingContext';

const FORMAT_OPTIONS: Array<{ value: 'feed' | 'story' | 'reel'; label: string }> = [
  { value: 'feed', label: 'Feed (1:1 square)' },
  { value: 'story', label: 'Story (9:16)' },
  { value: 'reel', label: 'Reel cover (9:16)' },
];

/**
 * New offer at `/marketing/offer/new`. Five steps. Looks good saves a draft and does not post.
 */
export function NewOfferPage(): JSX.Element {
  const navigate = useNavigate();
  const ctx = useMarketingContext();
  const userId = useAuthStore((s) => s.user?.authUserId ?? s.user?.id ?? '');
  const { setup } = useContentTenant();
  const [step, setStep] = useState<NewOfferStep>('Product');
  const [recipe, setRecipe] = useState<OfferRecipe>('product_drop');
  const [includeInstagram, setIncludeInstagram] = useState(true);
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState('');
  const [claim, setClaim] = useState('');
  const [place, setPlace] = useState('');
  const [materials, setMaterials] = useState('');
  const [inFrame, setInFrame] = useState('');
  const [keepOut, setKeepOut] = useState('');
  const [look, setLook] = useState('photoreal');
  const [format, setFormat] = useState<'feed' | 'story' | 'reel'>('feed');
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('');
  const [captionDirection, setCaptionDirection] = useState('');
  const [productError, setProductError] = useState('');
  const [topicError, setTopicError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!productName) return;
    if (setup.productTruth.some((row) => row.name === productName)) return;
    setProductName('');
    setPlace('');
    setPrice('');
    setClaim('');
    setMaterials('');
    setInFrame('');
    setKeepOut('');
    setProductError('');
    setStep('Product');
  }, [setup, productName]);

  const slots = planRecipeChildren(recipe, { includeInstagram });
  const wantsInstagram = slots.includes('instagram');
  const sceneLine = wantsInstagram
    ? offerSceneSentence({ product: productName, place, materials, inFrame, keepOut, look })
    : '';
  const stepIndex = NEW_OFFER_STEPS.indexOf(step);

  const goNext = useCallback(() => {
    if (step === 'Product' && productDropNeedsProduct(recipe, productName)) {
      setProductError('product: Pick a product from this org’s truth sheet.');
      return;
    }
    if (step === 'Words' && !topic.trim()) {
      setTopicError('Topic is required');
      return;
    }
    setProductError('');
    setTopicError('');
    const next = NEW_OFFER_STEPS[stepIndex + 1];
    if (next) setStep(next);
  }, [step, recipe, productName, topic, stepIndex]);

  const save = useCallback(() => {
    if (productDropNeedsProduct(recipe, productName) || !topic.trim() || saving || !userId) {
      if (productDropNeedsProduct(recipe, productName)) {
        setProductError('product: Pick a product from this org’s truth sheet.');
        setStep('Product');
      }
      return;
    }
    const picture = wantsInstagram;
    const brief = serializeStudioBrief({
      intent: [topic.trim(), captionDirection.trim()].filter(Boolean).join('\n'),
      product: productName.trim(),
      truthId: productName.trim() ? fixtureTruthId(setup.orgKey, productName) : '',
      place: picture ? place : '',
      price,
      claim,
      materials: picture ? materials : '',
      inFrame: picture ? inFrame : '',
      keepOut: picture ? keepOut : '',
      style: picture ? look : '',
      language: setup.language,
    });
    setSaving(true);
    void createInstagramOfferPair(userId, {
      topic: topic.trim(),
      format,
      recipe,
      includeInstagram,
      userBrief: brief,
    })
      .then((pair) => {
        ctx.openDetail({ type: 'content', id: pair.offer.id });
        navigate(ROUTES.MARKETING);
      })
      .catch((err: unknown) => {
        toast.error('Could not save the offer', {
          description: err instanceof Error ? err.message : 'Request failed',
        });
      })
      .finally(() => setSaving(false));
  }, [
    recipe,
    productName,
    topic,
    saving,
    userId,
    wantsInstagram,
    place,
    price,
    claim,
    materials,
    inFrame,
    keepOut,
    look,
    setup,
    format,
    includeInstagram,
    ctx,
    navigate,
    captionDirection,
  ]);

  return (
    <ViewportWrapper className="min-h-0 flex-1 bg-[#f4efe8] text-[#1c1917] [&_.text-app-muted]:text-[#78716c] [&_.text-app-text]:text-[#1c1917]">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-xl flex-col px-4 py-4 pb-24">
        <div className="mb-4 flex items-end gap-3">
          <button type="button" className="mb-2 text-sm text-[#78716c]" onClick={() => navigate(ROUTES.MARKETING)}>
            Back to offers
          </button>
          <h1 className="mb-2 text-lg font-medium">New offer</h1>
          <div className="ml-auto w-48">
            <ContentTenantSwitch />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#e7e0d6] bg-white p-4">
        <ol className="mb-4 flex flex-wrap gap-2">
          {NEW_OFFER_STEPS.map((name, index) => (
            <li key={name} className={`text-xs ${index === stepIndex ? 'text-app-text' : 'text-app-muted'}`} aria-current={index === stepIndex ? 'step' : undefined}>
              {name}
            </li>
          ))}
        </ol>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {step === 'Product' ? (
            <ProductStep
              recipe={recipe}
              setRecipe={setRecipe}
              includeInstagram={includeInstagram}
              setIncludeInstagram={setIncludeInstagram}
              productName={productName}
              productError={productError}
              price={price}
              claim={claim}
              products={setup.productTruth}
              onProduct={(name) => {
                setProductName(name);
                setProductError('');
                const row = setup.productTruth.find((item) => item.name === name);
                const facts = priceAndPlace(row?.description);
                setPrice(facts.price);
                setPlace(facts.place);
                setMaterials(facts.materials);
                setClaim('');
              }}
            />
          ) : null}
          {step === 'Picture' ? (
            wantsInstagram ? (
              <PictureStep
                materials={materials}
                setMaterials={setMaterials}
                place={place}
                setPlace={setPlace}
                inFrame={inFrame}
                setInFrame={setInFrame}
                keepOut={keepOut}
                setKeepOut={setKeepOut}
                look={look}
                setLook={setLook}
                format={format}
                setFormat={setFormat}
                sceneLine={sceneLine}
                onFile={(file) => {
                  if (!file || !userId) return;
                  void marketingAPI.uploadLucyReferenceImage(userId, file).catch((err: unknown) => {
                    toast.error('Upload failed', {
                      description: err instanceof Error ? err.message : 'Could not upload image',
                    });
                  });
                }}
              />
            ) : (
              <p className="text-sm text-app-muted">
                A public Instagram post is a different recipe. This saves the email only.
              </p>
            )
          ) : null}
          {step === 'Words' ? (
            <WordsStep
              topic={topic}
              setTopic={(value) => {
                setTopic(value);
                setTopicError('');
              }}
              topicError={topicError}
              tone={tone}
              setTone={setTone}
              captionDirection={captionDirection}
              setCaptionDirection={setCaptionDirection}
              showCaption={Boolean(productName.trim() || place.trim())}
            />
          ) : null}
          {step === 'Preview' ? (
            <div className="space-y-2 text-sm text-app-text">
              <p>{productName || 'No product'}</p>
              {price ? <p className="text-app-muted">{price}</p> : null}
              {sceneLine ? (
                <p className="text-app-muted" data-testid="scene-line">
                  {sceneLine}
                </p>
              ) : (
                <p className="text-app-muted">Email only. No still.</p>
              )}
              <p className="text-app-muted">{topic}</p>
            </div>
          ) : null}
          {step === 'Looks good' ? (
            <div className="space-y-3 text-sm text-app-text">
              <p>Looks good saves this draft. It does not schedule or post.</p>
              <p className="text-app-muted">{productName || topic}</p>
              {sceneLine ? <p className="text-app-muted">{sceneLine}</p> : null}
            </div>
          ) : null}
        </div>
        <div className="mt-4 flex gap-3">
          {stepIndex > 0 ? (
            <button
              type="button"
              className="text-sm text-app-muted"
              onClick={() => {
                const prev = NEW_OFFER_STEPS[stepIndex - 1];
                if (prev) setStep(prev);
              }}
            >
              Back
            </button>
          ) : null}
          {step === 'Looks good' ? (
            <button type="button" className="text-sm text-app-text" disabled={saving} onClick={save}>
              {saving ? 'Saving' : 'Looks good'}
            </button>
          ) : (
            <button type="button" className="text-sm text-app-text" onClick={goNext}>
              Next
            </button>
          )}
        </div>
        </div>
      </div>
    </ViewportWrapper>
  );
}

function ProductStep(props: {
  recipe: OfferRecipe;
  setRecipe: (recipe: OfferRecipe) => void;
  includeInstagram: boolean;
  setIncludeInstagram: (value: boolean) => void;
  productName: string;
  productError: string;
  price: string;
  claim: string;
  products: ReadonlyArray<{ name: string }>;
  onProduct: (name: string) => void;
}): JSX.Element {
  return (
    <div className="space-y-3">
      <label className="block text-xs text-app-muted" htmlFor="offer-recipe">
        Recipe
        <select
          id="offer-recipe"
          value={props.recipe}
          onChange={(e) => props.setRecipe(e.target.value as OfferRecipe)}
          className="input-theme mt-1 h-[42px] w-full rounded-lg px-3 text-sm"
        >
          <option value="product_drop">Product drop (post and email)</option>
          <option value="occasion">Occasion (email, post optional)</option>
          <option value="cart">Cart reminder (email only)</option>
        </select>
      </label>
      {props.recipe === 'occasion' ? (
        <label className="flex items-center gap-2 text-xs text-app-muted">
          <input
            type="checkbox"
            checked={props.includeInstagram}
            onChange={(e) => props.setIncludeInstagram(e.target.checked)}
          />
          Also create an Instagram post
        </label>
      ) : null}
      <label className="block text-xs text-app-muted" htmlFor="offer-product">
        Product {props.recipe === 'product_drop' ? '*' : ''}
        <select
          id="offer-product"
          value={props.productName}
          onChange={(e) => props.onProduct(e.target.value)}
          className="input-theme mt-1 h-[42px] w-full rounded-lg px-3 text-sm"
        >
          <option value="">Pick a product</option>
          {props.products.map((row) => (
            <option key={row.name} value={row.name}>
              {row.name}
            </option>
          ))}
        </select>
      </label>
      {props.productError ? <p className="text-xs text-red-400">{props.productError}</p> : null}
      <label className="block text-xs text-app-muted" htmlFor="offer-price">
        Price
        <Input id="offer-price" value={props.price} readOnly className="mt-1 w-full" />
      </label>
      <label className="block text-xs text-app-muted" htmlFor="offer-claim">
        Claim
        <Input id="offer-claim" value={props.claim} readOnly className="mt-1 w-full" />
      </label>
    </div>
  );
}

function PictureStep(props: {
  materials: string;
  setMaterials: (value: string) => void;
  place: string;
  setPlace: (value: string) => void;
  inFrame: string;
  setInFrame: (value: string) => void;
  keepOut: string;
  setKeepOut: (value: string) => void;
  look: string;
  setLook: (value: string) => void;
  format: 'feed' | 'story' | 'reel';
  setFormat: (value: 'feed' | 'story' | 'reel') => void;
  sceneLine: string;
  onFile: (file: File | undefined) => void;
}): JSX.Element {
  return (
    <div className="space-y-3">
      <label className="block text-xs text-app-muted" htmlFor="offer-materials">
        Materials
        <Input id="offer-materials" value={props.materials} onChange={(e) => props.setMaterials(e.target.value)} className="mt-1 w-full" />
      </label>
      <label className="block text-xs text-app-muted" htmlFor="offer-place">
        Place
        <Input id="offer-place" value={props.place} onChange={(e) => props.setPlace(e.target.value)} className="mt-1 w-full" />
      </label>
      <label className="block text-xs text-app-muted" htmlFor="offer-in-frame">
        In frame
        <Input id="offer-in-frame" value={props.inFrame} onChange={(e) => props.setInFrame(e.target.value)} className="mt-1 w-full" />
      </label>
      <label className="block text-xs text-app-muted" htmlFor="offer-keep-out">
        Keep out
        <Input id="offer-keep-out" value={props.keepOut} onChange={(e) => props.setKeepOut(e.target.value)} className="mt-1 w-full" />
      </label>
      <label className="block text-xs text-app-muted" htmlFor="offer-look">
        Look
        <select
          id="offer-look"
          value={props.look}
          onChange={(e) => props.setLook(e.target.value)}
          className="input-theme mt-1 h-[42px] w-full rounded-lg px-3 text-sm"
        >
          {STILL_LOOKS.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-app-muted" htmlFor="offer-format">
        Format
        <select
          id="offer-format"
          value={props.format}
          onChange={(e) => props.setFormat(e.target.value as 'feed' | 'story' | 'reel')}
          className="input-theme mt-1 h-[42px] w-full rounded-lg px-3 text-sm"
        >
          {FORMAT_OPTIONS.map((row) => (
            <option key={row.value} value={row.value}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-app-muted" htmlFor="offer-reference">
        Reference photo
        <input
          id="offer-reference"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="mt-1 block text-xs"
          onChange={(e) => props.onFile(e.target.files?.[0])}
        />
      </label>
      <p className="text-xs text-app-muted">
        Ultra keeps what is inside this photo. A counter that is not in the frame cannot be added by a higher strength.
      </p>
      {props.sceneLine ? (
        <p className="text-xs text-app-muted" data-testid="scene-line">
          {props.sceneLine}
        </p>
      ) : null}
    </div>
  );
}

function WordsStep(props: {
  topic: string;
  setTopic: (value: string) => void;
  topicError: string;
  tone: string;
  setTone: (value: string) => void;
  captionDirection: string;
  setCaptionDirection: (value: string) => void;
  showCaption: boolean;
}): JSX.Element {
  return (
    <div className="space-y-3">
      <label className="block text-xs text-app-muted" htmlFor="offer-topic">
        Topic / goal *
        <Input id="offer-topic" value={props.topic} onChange={(e) => props.setTopic(e.target.value)} className="mt-1 w-full" />
      </label>
      {props.topicError ? <p className="text-xs text-red-400">{props.topicError}</p> : null}
      <label className="block text-xs text-app-muted" htmlFor="offer-tone">
        Tone
        <Input id="offer-tone" value={props.tone} onChange={(e) => props.setTone(e.target.value)} className="mt-1 w-full" />
      </label>
      {props.showCaption ? (
        <label className="block text-xs text-app-muted" htmlFor="offer-caption">
          Caption direction
          <Input
            id="offer-caption"
            value={props.captionDirection}
            onChange={(e) => props.setCaptionDirection(e.target.value)}
            className="mt-1 w-full"
          />
        </label>
      ) : null}
    </div>
  );
}
